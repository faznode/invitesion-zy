#!/usr/bin/env python3
"""Offline regression tests for benchmark-pack.py (tier rule, percentile direction, theme-first medians, exclusions).

    python3 -B invitation-research/_tools/capture/test_benchmark_pack.py
"""
import csv
import importlib.util
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_spec = importlib.util.spec_from_file_location('benchmark_pack', os.path.join(HERE, 'benchmark-pack.py'))
bp = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bp)


def row(cid, competitor='vendor', theme='t1', population='competitor', cold=True, struct=True, **values):
    base = {'id': cid, 'competitor': competitor, 'theme_key': theme, 'population': population,
            'coldload_eligible': str(cold), 'structure_eligible': str(struct), 'libs': '', 'features': '',
            'audio_elements': '0', 'sections': '5', 'og_image': 'True', 'reduced_motion_css': 'False', 'dom_nodes': '900',
            'cover_detected': 'True', 'click_attempted': 'True', 'gate_opening': 'verified_open', 'audio_playback': 'not_measured'}
    base.update({k: str(v) for k, v in values.items()})
    return base


class TierRule(unittest.TestCase):
    def test_scroll_linked_motion_is_signature(self):
        self.assertEqual(bp.classify(row('C-X-1', libs='gsap scrollTrigger'))[0], 'signature')

    def test_audio_element_or_music_control_is_premium(self):
        self.assertEqual(bp.classify(row('C-X-1', audio_elements=1))[0], 'premium')
        self.assertEqual(bp.classify(row('C-X-1', features='musicControl rsvp'))[0], 'premium')

    def test_level_two_library_is_premium(self):
        self.assertEqual(bp.classify(row('C-X-1', libs='aos jquery'))[0], 'premium')

    def test_no_signal_is_basic_with_low_confidence(self):
        tier, signals, conf = bp.classify(row('C-X-1', libs='jquery swiper'))
        self.assertEqual((tier, signals, conf), ('basic', [], 'low'))


class Statistics(unittest.TestCase):
    def test_percentile_interpolates(self):
        self.assertEqual(bp.percentile([1, 2, 3, 4, 5], 0.75), 4)
        self.assertEqual(bp.percentile([10], 0.25), 10)

    def test_p75_direction_follows_the_metric(self):
        rows = [row(f'C-X-{i}', theme=f't{i}', perf=p, lcp_ms=l) for i, (p, l) in enumerate([(20, 9000), (40, 7000), (60, 5000), (80, 3000), (100, 1000)])]
        _, aggregates, _ = bp.build(rows)
        perf = next(a for a in aggregates if a['metric'] == 'perf' and a['tier'] == 'all')
        lcp = next(a for a in aggregates if a['metric'] == 'lcp_ms' and a['tier'] == 'all')
        self.assertEqual((perf['p75'], perf['best']), (40.0, 100.0))   # 75 % of themes score at least 40
        self.assertEqual((lcp['p75'], lcp['best']), (7000.0, 1000.0))  # 75 % of themes load in at most 7 s

    def test_retries_do_not_overweight_a_theme(self):
        rows = [row('C-X-1', theme='a', lh_kib=100), row('C-X-2', theme='a', lh_kib=300), row('C-X-3', theme='b', lh_kib=1000)]
        _, aggregates, _ = bp.build(rows)
        kib = next(a for a in aggregates if a['metric'] == 'lh_kib' and a['tier'] == 'all')
        self.assertEqual((kib['n_themes'], kib['n_captures'], kib['median']), (2, 3, 600.0))  # medians 200 and 1000

    def test_ineligible_rows_never_enter(self):
        rows = [row('C-X-1', theme='a', lh_kib=100), row('C-X-2', theme='b', cold=False, struct=False, lh_kib=1)]
        tiers, aggregates, blueprints = bp.build(rows)
        self.assertEqual([t['theme_key'] for t in tiers], ['a'])
        self.assertEqual(next(a for a in aggregates if a['metric'] == 'lh_kib')['best'], 100.0)

    def test_sensitivity_build_reads_the_sensitivity_columns(self):
        rows = [row('C-X-1', theme='a', lh_kib=100),
                row('C-X-2', theme='b', cold=False, struct=False, lh_kib=900,
                    coldload_eligible_sensitivity=True, structure_eligible_sensitivity=True)]
        for r in rows[:1]:
            r.update(coldload_eligible_sensitivity='True', structure_eligible_sensitivity='True')
        plain, sens = bp.build(rows), bp.build(rows, sensitivity=True)
        self.assertEqual([t['theme_key'] for t in plain[0]], ['a'])
        self.assertEqual([t['theme_key'] for t in sens[0]], ['a', 'b'])
        self.assertIn('| all | lh_kib |', bp.compare(plain[1], sens[1]))

    def test_own_pages_stay_out_of_competitor_aggregates(self):
        rows = [row('C-X-1', theme='a', lh_kib=5000), row('C-INV-005', competitor='invitesion', theme='own', population='own', lh_kib=311)]
        _, aggregates, _ = bp.build(rows)
        comp = next(a for a in aggregates if a['population'] == 'competitor' and a['metric'] == 'lh_kib' and a['tier'] == 'all')
        self.assertEqual((comp['n_themes'], comp['best']), (1, 5000.0))


class Viewport(unittest.TestCase):
    """Protocol v2 outputs (s13): one population per profile, paired deltas against the same-session v2-412 control."""

    @staticmethod
    def rows():
        return [row('C-X-1', theme='a', profile='v2-412', perf=60, layout_overflow_px=0),
                row('C-X-2', theme='a', profile='v2-360', perf=50, layout_overflow_px=12),
                row('C-X-3', theme='a', profile='v2-390', cold=False, perf=99, layout_overflow_px=4),
                row('C-X-4', theme='a', profile='v2-412-rm', struct=False, perf=64, layout_overflow_px=999),
                row('C-X-5', theme='b', profile='v1-412', perf=10, layout_overflow_px=0)]

    def test_profiles_are_never_pooled(self):
        aggregates, _, _ = bp.build_viewport(self.rows())
        perf = {a['profile']: a for a in aggregates if a['metric'] == 'perf'}
        self.assertEqual([(p, perf[p]['n_themes'], perf[p]['median']) for p in sorted(perf)],
                         [('v2-360', 1, 50.0), ('v2-412', 1, 60.0), ('v2-412-rm', 1, 64.0)])  # v2-390 not cold-load eligible

    def test_deltas_need_both_profiles_eligible_for_the_metric_source(self):
        _, paired, summary = bp.build_viewport(self.rows())
        perf = next(p for p in paired if p['metric'] == 'perf')
        self.assertEqual((perf['delta_v2-360'], perf['delta_v2-390'], perf['delta_v2-412-rm']), (-10.0, '', 4.0))
        overflow = next(p for p in paired if p['metric'] == 'layout_overflow_px')
        self.assertEqual((overflow['delta_v2-360'], overflow['delta_v2-390'], overflow['delta_v2-412-rm']), (12.0, 4.0, ''))
        worse = next(s for s in summary if s['metric'] == 'perf' and s['comparison'] == 'v2-360 vs v2-412')
        self.assertEqual((worse['n_pairs'], worse['n_worse'], worse['n_better']), (1, 1, 0))

    def test_v1_tier_files_ignore_v2_captures(self):
        tiers, _, _ = bp.build(self.rows())
        self.assertEqual([t['theme_key'] for t in tiers], ['b'])


class OwnBuilds(unittest.TestCase):
    """eligibility.py rule 8 (s14): each build of our own page is a separate population in every output."""

    @staticmethod
    def own(cid, profile='v1-412', lh_kib=311):
        return row(cid, competitor='invitesion', theme='own', population='own', profile=profile, lh_kib=lh_kib, perf=90)

    def test_later_own_builds_never_enter_the_tier_files(self):
        _, aggregates, _ = bp.build([row('C-X-1', theme='a', lh_kib=4000), self.own('C-INV-005'), self.own('C-INV-006', lh_kib=999)])
        own = next(a for a in aggregates if a['population'] == 'own' and a['metric'] == 'lh_kib' and a['tier'] == 'all')
        self.assertEqual((own['n_captures'], own['best'], own['best_theme_capture']), (1, 311.0, 'C-INV-005'))
        self.assertEqual(own['confidence'], 'own pages, build 22ed99e (not a market sample)')

    def test_viewport_reports_each_own_build_apart(self):
        rows = [self.own('C-INV-008', 'v2-412', 300), self.own('C-INV-099', 'v2-412', 900), row('C-X-1', theme='a', profile='v2-412', lh_kib=4000)]
        aggregates, paired, _ = bp.build_viewport(rows)
        kib = {a['population']: a for a in aggregates if a['metric'] == 'lh_kib'}
        self.assertEqual(sorted(kib), ['competitor', 'own@0b5eb1b', 'own@unknown'])
        self.assertEqual([(p, kib[p]['n_captures'], kib[p]['median']) for p in ('own@0b5eb1b', 'own@unknown')],
                         [('own@0b5eb1b', 1, 300.0), ('own@unknown', 1, 900.0)])
        self.assertEqual(kib['own@0b5eb1b']['confidence'], 'own pages, build 0b5eb1b (not a market sample)')
        self.assertFalse([p for p in paired if p['population'] == 'own'])

    def test_an_edited_population_makes_the_summary_stale(self):
        with open(bp.SUMMARY, encoding='utf-8') as handle:
            rows = list(csv.DictReader(handle))
        next(r for r in rows if r['id'] == 'C-INV-006')['measurement_population'] = 'v1-412 own@22ed99e'
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'captures-summary.csv')
            with open(path, 'w', newline='', encoding='utf-8') as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            saved, bp.SUMMARY = bp.SUMMARY, path
            try:
                _, stale = bp.load_rows()
            finally:
                bp.SUMMARY = saved
        self.assertEqual(stale, ["C-INV-006: measurement_population summary='v1-412 own@22ed99e' recomputed='v1-412 own@0b5eb1b'"])


class RealData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows, stale = bp.load_rows()
        cls.stale = stale
        cls.tiers, cls.aggregates, cls.blueprints = bp.build(rows)
        cls.s_tiers, cls.s_aggregates, cls.s_blueprints = bp.build(rows, sensitivity=True)

    def test_provisional_captures_only_in_the_sensitivity_set(self):
        g2 = [f'C-ENV-{n}' for n in range(111, 124)]
        unconditional = ' '.join(t['coldload_captures'] + ' ' + t['structure_captures'] for t in self.tiers)
        sensitivity = ' '.join(t['coldload_captures'] + ' ' + t['structure_captures'] for t in self.s_tiers)
        self.assertFalse([c for c in g2 if c in unconditional])
        self.assertEqual(len([t for t in self.s_tiers if t['competitor'] == 'enviory']), 6)
        self.assertTrue(all(c in sensitivity for c in ('C-ENV-111', 'C-ENV-122', 'C-ENV-123')))
        self.assertEqual(len(self.s_tiers) - len(self.tiers), 6)

    def test_sensitivity_files_on_disk_are_current(self):
        for name, records in zip(bp.OUTPUT_NAMES, (self.s_tiers, self.s_aggregates, self.s_blueprints)):
            with open(os.path.join(bp.BENCH, bp.output_path(name, sensitivity=True)), encoding='utf-8') as handle:
                self.assertEqual(handle.read(), bp.render(records), name)

    def test_summary_matches_recomputed_eligibility(self):
        self.assertEqual(self.stale, [])

    def test_curated_exclusions_are_absent(self):
        ids = ' '.join(t['coldload_captures'] + ' ' + t['structure_captures'] for t in self.tiers)
        for cid in ['C-VID-104', 'C-VID-105', 'C-VID-106', 'C-INV-101'] + [f'C-IDI-10{i}' for i in range(1, 8)] + [f'C-ENV-10{i}' for i in range(1, 7)]:
            self.assertNotIn(cid, ids)

    def test_korean_vendor_carries_the_detector_caveat(self):
        for bpr in self.blueprints:
            if bpr['competitor'] == 'barunson':
                self.assertIn('Korean page', bpr['caveats'])

    def test_files_on_disk_are_current(self):
        for name, records in (('tiers.csv', self.tiers), ('tier-aggregates.csv', self.aggregates), ('blueprints.csv', self.blueprints)):
            with open(os.path.join(bp.BENCH, name), encoding='utf-8') as handle:
                self.assertEqual(handle.read(), bp.render(records), name)


if __name__ == '__main__':
    unittest.main(verbosity=1)
