#!/usr/bin/env python3
"""Offline regression tests: benchmark eligibility, measurement sources, privacy redaction (brief 05 Task B3).

    python3 -B invitation-research/_tools/capture/test_eligibility.py        # stdlib unittest, ~1 s, no network

Every case uses preserved evidence in raw/ or a small synthetic fixture built in a temp dir. No competitor is contacted
and no capture is made. Fixture names are fake ("Budi & Sari"), as AGENTS.md requires.
"""
import copy
import csv
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import eligibility as elig  # noqa: E402


def load_script(name, relative):
    spec = importlib.util.spec_from_file_location(name, os.path.normpath(os.path.join(HERE, relative)))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


summarize = load_script('summarize_captures', 'summarize-captures.py')
redact = load_script('redact_demo_names', '../safety/redact-demo-names.py')
DIGEST = os.path.join(HERE, 'dossier-digest.py')
SUMMARIZE = os.path.join(HERE, 'summarize-captures.py')
PSEUDONYMIZE = os.path.normpath(os.path.join(HERE, '..', 'safety', 'pseudonymize.mjs'))

CAPTURES = elig.load_captures()
BY_ID = {c['id']: c for c in CAPTURES}
REGISTER = elig.load_register(known_ids=set(BY_ID))
RESULTS = elig.evaluate_all(CAPTURES, REGISTER)
IDS = lambda prefix, numbers: [f'{prefix}-{n}' for n in numbers]


def write_register(directory, rows, columns=elig.REGISTER_COLUMNS):
    path = os.path.join(directory, 'register.csv')
    with open(path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    return path


def rule_row(cid, scope='all', page_class='guest_page', decision='D-099', reason='fixture'):
    return {'capture_id': cid, 'scope': scope, 'page_class': page_class, 'reason': reason, 'decision': decision,
            'evidence': 'fixture', 'revisit_when': 'never'}


class RegisterIntegrity(unittest.TestCase):
    def test_committed_register_and_captures_have_no_errors(self):
        errors = [p for p in elig.all_problems(REGISTER, CAPTURES, RESULTS) if p[0] == 'error']
        self.assertEqual(errors, [])
        self.assertEqual(REGISTER.rows, len(REGISTER.rules))

    def test_invalid_definitions_are_reported_and_applied_conservatively(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_register(tmp, [
                rule_row('C-WEV-101', scope='partial'),                          # invalid scope
                rule_row('C-WEV-102', page_class='demo'),                        # invalid page class
                rule_row('C-WEV-103', scope='structure', page_class='wrapper'),  # contradiction
                rule_row('C-ZZZ-999'),                                           # unknown reference
                rule_row('ENV-101'),                                             # malformed id
                rule_row('C-WEV-104', decision=''),                              # empty decision
                rule_row('C-WEV-105', decision='X-1'),                           # not a D-NNN id (warning)
                rule_row('C-WEV-106', scope='structure'),
                rule_row('C-WEV-106', scope='structure'),                        # duplicate
                rule_row('C-KAT-101', scope='structure'),
                rule_row('C-KAT-101', scope='all'),                              # conflicting
            ])
            register = elig.load_register(path, known_ids=set(BY_ID))
        messages = {(level, cid): message for level, cid, message in register.problems}
        for cid, fragment in [('C-WEV-101', "invalid scope 'partial'"), ('C-WEV-102', "invalid page_class 'demo'"),
                              ('C-WEV-103', 'contradicts page_class=wrapper'), ('C-ZZZ-999', 'unknown capture id'),
                              ('ENV-101', 'invalid capture_id'), ('C-WEV-104', 'empty decision'),
                              ('C-WEV-106', 'duplicate row'), ('C-KAT-101', 'conflicting row')]:
            self.assertIn(fragment, messages.get(('error', cid), ''), cid)
        self.assertIn('not a D-NNN id', messages[('warning', 'C-WEV-105')])
        for cid in ('C-WEV-101', 'C-WEV-102', 'C-WEV-103', 'C-WEV-104', 'C-KAT-101'):
            ev = elig.evaluate(BY_ID[cid], register.rules[cid])
            self.assertFalse(ev['coldload_eligible'], cid)
            self.assertFalse(ev['structure_eligible'], cid)

    def test_missing_column_is_an_error(self):
        columns = [c for c in elig.REGISTER_COLUMNS if c != 'page_class']
        with tempfile.TemporaryDirectory() as tmp:
            register = elig.load_register(write_register(tmp, [rule_row('C-WEV-101')], columns), known_ids=set(BY_ID))
        self.assertTrue(any(level == 'error' and 'page_class' in message for level, _, message in register.problems))

    def test_summarizer_strict_mode_fails_on_a_bad_register(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_register(tmp, [rule_row('C-WEV-101', scope='partial')])
            run = subprocess.run([sys.executable, '-B', SUMMARIZE, '--strict', '--register', path,
                                  '--out', os.path.join(tmp, 'out.csv')], capture_output=True, text=True)
        self.assertEqual(run.returncode, 1)
        self.assertIn("invalid scope 'partial'", run.stderr)


class Eligibility(unittest.TestCase):
    def test_1_indoinvite_catalog_pages_are_excluded(self):
        for cid in IDS('C-IDI', range(101, 108)):
            ev = RESULTS[cid]
            self.assertEqual((ev['page_class'], ev['page_class_source']), ('catalog', 'curated'), cid)
            self.assertFalse(ev['coldload_eligible'] or ev['structure_eligible'], cid)
        self.assertEqual(len(elig.coverage(CAPTURES, RESULTS)['indoinvite']['coldload']), 0)

    def test_2_viding_studio_captures_never_enter_aggregates(self):
        for cid in IDS('C-VID', (104, 105, 106)):
            self.assertFalse(RESULTS[cid]['coldload_eligible'] or RESULTS[cid]['structure_eligible'], cid)
        run = subprocess.run([sys.executable, '-B', DIGEST, '--competitor', 'viding'] + IDS('C-VID', range(101, 107)),
                             capture_output=True, text=True, check=True)
        self.assertIn('Median of 3 theme(s), 3 eligible capture(s)', run.stdout)
        vid104 = [line for line in run.stdout.splitlines() if line.startswith('| C-VID-104 |')]
        self.assertEqual(len(vid104), 2)
        for line in vid104:
            self.assertNotRegex(line.split('|', 4)[4], r'\d', 'excluded row must print no numbers')
        perf = sorted(BY_ID[c]['lighthouse']['scores']['performance'] for c in IDS('C-VID', (101, 102, 103)))[1]
        self.assertIn(f'**{perf}**', [line for line in run.stdout.splitlines() if 'Median of 3' in line][0])

    def test_2a_scope_all_alone_excludes_a_valid_guest_page(self):
        clean = copy.deepcopy(BY_ID['C-WEV-104'])
        self.assertTrue(elig.evaluate(clean, None)['coldload_eligible'])
        rule = {'scope': 'all', 'page_class': 'guest_page', 'decision': 'D-099', 'reason': 'x', 'valid': True, 'line': 2}
        ev = elig.evaluate(clean, rule)
        self.assertEqual((ev['coldload_eligible'], ev['structure_eligible']), (False, False))
        self.assertEqual(ev['coldload_reasons'], ['register scope=all (D-099)'])

    def test_2b_robots_failure_without_exclusion_is_an_error(self):
        rules = {k: v for k, v in REGISTER.rules.items() if k != 'C-VID-104'}
        ev = elig.evaluate(BY_ID['C-VID-104'], rules.get('C-VID-104'))
        self.assertTrue(any(level == 'error' and 'D-022' in message for level, message in ev['findings']))
        self.assertFalse(ev['coldload_eligible'] or ev['structure_eligible'])

    def test_3_structure_only_exclusions_keep_cold_load(self):
        # The exclusion register's own semantics, read in the sensitivity population: the ENV rows are also provisional
        # (D-031), which removes them from the unconditional population independently (ProvisionalEvidence below).
        for cid in IDS('C-ENV', (112, 113, 117, 118, 119, 120, 121)):
            self.assertTrue(RESULTS[cid]['coldload_eligible_sensitivity'], cid)
            self.assertFalse(RESULTS[cid]['structure_eligible_sensitivity'], cid)
        for cid in IDS('C-IVT', (102, 103)):
            self.assertTrue(RESULTS[cid]['coldload_eligible'], cid)
            self.assertFalse(RESULTS[cid]['structure_eligible'], cid)
        env = elig.coverage(CAPTURES, RESULTS, sensitivity=True)['enviory']
        self.assertEqual((env['coldload_n'], len(env['coldload']), env['structure_n'], len(env['structure'])), (13, 6, 6, 6))

    def test_3b_curated_row_beats_the_wrapper_heuristic(self):
        for cid in ('C-ENV-117', 'C-ENV-120'):
            ev = RESULTS[cid]
            self.assertTrue(ev['wrapper_heuristic'])
            self.assertEqual(ev['page_class'], 'guest_page')
            self.assertTrue(ev['coldload_eligible_sensitivity'])
        uncurated = elig.evaluate(BY_ID['C-ENV-117'], None)
        self.assertEqual((uncurated['page_class'], uncurated['coldload_eligible']), ('wrapper', False))

    def test_4_failed_lighthouse_never_enters_aggregates(self):
        for cid in ('C-IDI-104', 'C-INV-101'):
            self.assertIn('Lighthouse failed', RESULTS[cid]['coldload_reasons'])
        failed = copy.deepcopy(BY_ID['C-WEV-104'])
        failed.update(id='C-ZZZ-901')
        failed['lighthouse']['ok'] = False
        ev = elig.evaluate(failed, None)
        self.assertEqual((ev['coldload_eligible'], ev['structure_eligible']), (False, True))
        slow = copy.deepcopy(BY_ID['C-WEV-104'])
        slow['lighthouse']['throttling']['cpuSlowdownMultiplier'] = 1
        self.assertIn('differ from the protocol', ' '.join(elig.evaluate(slow, None)['coldload_reasons']))
        structure_rule = {'scope': 'structure', 'page_class': 'guest_page', 'decision': 'D-099', 'reason': 'x', 'valid': True, 'line': 2}
        self.assertTrue(any('Lighthouse failed' in message for _, message in elig.evaluate(failed, structure_rule)['findings']))
        samples = [(elig.theme_key(c['url']), c) for c in (BY_ID['C-WEV-105'], failed)
                   if elig.evaluate(c, None)['coldload_eligible']]
        self.assertEqual([c['id'] for _, c in samples], ['C-WEV-105'])

    def test_5_retries_do_not_inflate_unique_coverage(self):
        self.assertEqual(RESULTS['C-IDI-104']['theme_key'], RESULTS['C-IDI-107']['theme_key'])
        self.assertEqual([RESULTS[c]['theme_attempt'] for c in ('C-IDI-104', 'C-IDI-107')], [1, 2])
        self.assertEqual(RESULTS['C-INV-001']['theme_key'], RESULTS['C-INV-005']['theme_key'])
        self.assertEqual(RESULTS['C-ENV-122']['theme_attempts'], 5)
        median, themes, captures = elig.theme_median([('a', 10), ('a', 20), ('a', 30), ('b', 100)], lambda v: v)
        self.assertEqual((median, themes, captures), (60, 2, 4))

    def test_5b_theme_identifiers_survive_deduplication(self):
        key = elig.theme_key
        self.assertNotEqual(key('https://enviory.com/x?tpl=rocaille'), key('https://enviory.com/x?tpl=velora'))
        self.assertEqual(key('https://demo.invi.id/p/a/?to=Nama%20Tamu'), key('https://demo.invi.id/p/a'))
        self.assertEqual(key('https://www.wevitation.com/demo/x/?utm_source=ig'), key('https://wevitation.com/demo/x'))
        self.assertEqual(key('https://invitato.net/t-1/?code=DUMMY-P0001&theme=2'), 'invitato.net/t-1?theme=2')

    def test_cover_facts_are_separate(self):
        expected = {'C-ENV-122': 'verified_open', 'C-WEV-104': 'verified_open', 'C-ENV-111': 'unverified_open',
                    'C-ENV-117': 'gate_persisted', 'C-ENV-118': 'no_click', 'C-BRN-101': 'no_cover_detected'}
        for cid, opening in expected.items():
            self.assertEqual(RESULTS[cid]['gate_opening'], opening, cid)
        self.assertTrue(RESULTS['C-ENV-118']['cover_detected'] and not RESULTS['C-ENV-118']['click_attempted'])
        self.assertEqual({ev['audio_playback'] for ev in RESULTS.values()}, {'not_measured'})
        self.assertTrue(set(ev['gate_opening'] for ev in RESULTS.values()) <= set(elig.GATE_OPENINGS))


class MeasurementProfiles(unittest.TestCase):
    """Protocol v2 (s13): each profile is its own population; the CDP emulation check gates structure evidence only (D-032)."""

    def test_9_a_v2_lighthouse_run_must_match_its_own_profile(self):
        lh = BY_ID['C-WEV-202']['lighthouse']  # profile v2-360
        self.assertEqual(elig.lighthouse_status(lh, 'v2-360'), (True, ''))
        ok, reason = elig.lighthouse_status(lh, 'v2-390')
        self.assertFalse(ok)
        self.assertIn('width=360', reason)
        self.assertIn('height=800', reason)
        self.assertFalse(elig.lighthouse_status(lh, elig.V1_PROFILE)[0])

    def test_9b_unverified_cdp_emulation_excludes_structure_only(self):
        pilot = BY_ID['C-WEV-201']  # pilot before the clear + set fix: the page saw DPR 1 and an 800 x 600 screen
        self.assertIs(pilot['measurement']['emulation_verified'], False)
        ev = RESULTS['C-WEV-201']
        self.assertEqual((ev['profile'], ev['coldload_eligible'], ev['structure_eligible']), ('v2-412', True, False))
        self.assertTrue(any(r.startswith('CDP emulation not verified for profile v2-412') for r in ev['structure_reasons']))
        verified = copy.deepcopy(pilot)
        verified['measurement'].update(emulation_verified=True, emulation_mismatches=[])
        ev = elig.evaluate(verified, None)
        self.assertEqual((ev['coldload_eligible'], ev['structure_eligible']), (True, True))

    def test_9c_an_unknown_profile_is_an_error_and_excludes_both(self):
        odd = copy.deepcopy(BY_ID['C-WEV-201'])
        odd['measurement']['profile'] = 'v2-375'
        ev = elig.evaluate(odd, None)
        self.assertEqual((ev['coldload_eligible'], ev['structure_eligible']), (False, False))
        self.assertTrue(any(level == 'error' and 'v2-375' in message for level, message in ev['findings']))

    def test_9d_profiles_are_separate_themes_for_retry_counting(self):
        pilot = IDS('C-WEV', range(201, 205))
        self.assertEqual(len({(RESULTS[c]['theme_key'], RESULTS[c]['profile']) for c in pilot}), 4)
        # Attempts count per theme and profile, never pooled across profiles. Counted from the data, because the s14
        # replacements C-WEV-225…228 (same theme, same four profiles; stored s15) are genuine retries within each profile.
        same_theme = [c for c, result in RESULTS.items() if result['theme_key'] == RESULTS['C-WEV-201']['theme_key']]
        for c in pilot:
            per_profile = sum(1 for other in same_theme if RESULTS[other]['profile'] == RESULTS[c]['profile'])
            self.assertEqual(RESULTS[c]['theme_attempts'], per_profile, c)
            self.assertLess(RESULTS[c]['theme_attempts'], len(same_theme), f'{c}: attempts pooled across profiles')
        self.assertEqual(RESULTS['C-WEV-104']['profile'], elig.V1_PROFILE)  # no measurement block = protocol v1.2


class PopulationBoundaries(unittest.TestCase):
    """Rule 8 (s14): one profile and, for our own pages, one product build per pooled statistic, in every consumer."""
    BASELINE, LATER = IDS('C-INV', ('001', '002', '003', '004', '005')), [f'C-INV-{n:03d}' for n in range(6, 16)]

    def digest(self, competitor, ids):
        return subprocess.run([sys.executable, '-B', DIGEST, '--competitor', competitor] + ids, capture_output=True, text=True)

    def test_10_own_builds_and_profiles_are_separate_populations(self):
        self.assertEqual({RESULTS[c]['measurement_population'] for c in self.BASELINE}, {'v1-412 own@22ed99e'})
        self.assertEqual({RESULTS[c]['measurement_population'] for c in IDS('C-INV', ('006', '007'))}, {'v1-412 own@0b5eb1b'})
        self.assertEqual(RESULTS['C-INV-008']['measurement_population'], 'v2-412 own@0b5eb1b')
        for cid in IDS('C-INV', range(201, 205)):  # naming hazard: C-INV-2xx are INVI.ID captures, not our page
            self.assertEqual((BY_ID[cid]['competitor'], RESULTS[cid]['own_build']), ('invi', ''), cid)
            self.assertEqual(RESULTS[cid]['measurement_population'], RESULTS[cid]['profile'], cid)
        self.assertEqual(RESULTS['C-VID-204']['measurement_population'], 'v2-412-rm')

    def test_10b_v12_population_is_v1_profile_plus_the_pre_p0_build(self):
        in_v12 = {c['id'] for c in CAPTURES if elig.v12_population(c['id'], c['competitor'], elig.capture_profile(c))}
        self.assertTrue(set(self.BASELINE) <= in_v12)
        self.assertFalse(set(self.LATER) & in_v12)
        self.assertFalse({c for c in in_v12 if RESULTS[c]['profile'] != elig.V1_PROFILE})
        self.assertEqual(in_v12, {c for c, ev in RESULTS.items() if ev['profile'] == elig.V1_PROFILE and ev['own_build'] in ('', '22ed99e')})

    def test_10c_retry_numbering_never_crosses_a_build(self):
        theme = RESULTS['C-INV-006']['theme_key']
        self.assertEqual(theme, RESULTS['C-INV-005']['theme_key'])  # same guest URL, re-measured on a later build
        self.assertEqual((RESULTS['C-INV-006']['theme_attempt'], RESULTS['C-INV-006']['theme_attempts']), (1, 1))
        self.assertEqual((RESULTS['C-INV-005']['theme_attempt'], RESULTS['C-INV-005']['theme_attempts']), (2, 2))  # with C-INV-001

    def test_10d_coverage_counts_one_build_of_our_page(self):
        own = elig.coverage(CAPTURES, RESULTS)['invitesion']
        self.assertEqual((own['captures'], own['coldload_n']), (5, 3))  # C-INV-001…005; cold-load: 001, 002, 005
        later = elig.coverage(CAPTURES, RESULTS, build='0b5eb1b')['invitesion']
        self.assertEqual((later['captures'], later['coldload_n']), (2, 2))  # C-INV-006 / 007 in v1-412

    def test_10e_unregistered_own_build_is_its_own_population(self):
        new = copy.deepcopy(BY_ID['C-INV-006'])
        new['id'] = 'C-INV-099'
        ev = elig.evaluate(new, None)
        self.assertEqual((ev['own_build'], ev['measurement_population']), ('unknown', 'v1-412 own@unknown'))
        self.assertTrue(any(level == 'warning' and 'without a registered build' in m for level, m in ev['findings']))
        self.assertFalse(elig.v12_population('C-INV-099', 'invitesion', elig.V1_PROFILE))

    def test_10f_digest_rejects_mixed_profiles_with_exit_status_2(self):
        run = self.digest('wevitation', ['C-WEV-104', 'C-WEV-201'])
        self.assertEqual(run.returncode, 2, run.stderr)
        self.assertIn('measurement populations v1-412, v2-412', run.stderr)
        self.assertEqual(run.stdout, '', 'no table may be printed for a rejected population')

    def test_10g_digest_rejects_mixed_own_builds_with_exit_status_2(self):
        run = self.digest('invitesion', ['C-INV-005', 'C-INV-006'])
        self.assertEqual(run.returncode, 2, run.stderr)
        self.assertIn('v1-412 own@0b5eb1b, v1-412 own@22ed99e', run.stderr)

    def test_10h_digest_single_population_succeeds_and_names_its_viewport(self):
        v1 = self.digest('wevitation', ['C-WEV-104'])
        self.assertEqual(v1.returncode, 0, v1.stderr)
        self.assertIn('412×915, cold cache', v1.stdout)
        narrow = self.digest('invitesion', ['C-INV-009', 'C-INV-013'])
        self.assertEqual(narrow.returncode, 0, narrow.stderr)
        self.assertIn('measurement population v2-360 own@0b5eb1b', narrow.stdout)
        self.assertIn('360×800, cold cache', narrow.stdout)
        reduced = self.digest('viding', ['C-VID-204'])
        self.assertEqual(reduced.returncode, 0, reduced.stderr)
        self.assertIn('412×915, prefers-reduced-motion: reduce', reduced.stdout)

    def test_10i_feature_matrix_derives_from_the_v12_population_only(self):
        matrix = load_script('build_matrix', '../../05-feature-matrix/build-matrix.py')
        derived, stats = matrix.derive(list(matrix.RAW_DIRS))
        self.assertEqual((stats['invitesion']['cold'], stats['invitesion']['cold_themes']), (3, 2))  # baseline build only
        cited = {cid for cell in derived.values() for cid in cell['evidence']}
        self.assertFalse({c for c in cited if not elig.v12_population(c, BY_ID[c]['competitor'], elig.capture_profile(BY_ID[c]))})


def write_provisional(directory, rows, columns=elig.PROVISIONAL_COLUMNS):
    path = os.path.join(directory, 'provisional.csv')
    with open(path, 'w', newline='', encoding='utf-8') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)
    return path


def provisional_row(cid, decision='D-099', question='Q-O99', reason='fixture'):
    return {'capture_id': cid, 'decision': decision, 'question': question, 'reason': reason, 'evidence': 'fixture',
            'revisit_when': 'never'}


class ProvisionalEvidence(unittest.TestCase):
    """D-031 / Q-O09 (s13): provisional captures leave the unconditional population and stay in the sensitivity one."""
    G2 = IDS('C-ENV', range(111, 124))

    def test_8_committed_provisional_register_is_exactly_the_g2_captures(self):
        self.assertEqual(sorted(REGISTER.provisional), self.G2)
        self.assertEqual(REGISTER.provisional_rows, len(self.G2))
        for cid, row in REGISTER.provisional.items():
            self.assertEqual((row['decision'], row['question'], row['valid']), ('D-031', 'Q-O09', True), cid)
        for cid in IDS('C-ENV', range(101, 107)):  # wrappers captured before the challenge: D-006, not provisional
            self.assertFalse(RESULTS[cid]['provisional'], cid)
            self.assertFalse(RESULTS[cid]['coldload_eligible_sensitivity'] or RESULTS[cid]['structure_eligible_sensitivity'], cid)

    def test_8b_provisional_rows_leave_only_the_unconditional_population(self):
        for cid in self.G2:
            ev, plain = RESULTS[cid], elig.evaluate(BY_ID[cid], REGISTER.rules.get(cid))
            self.assertTrue(ev['provisional'])
            self.assertEqual((ev['coldload_eligible'], ev['structure_eligible']), (False, False), cid)
            self.assertIn('provisional (D-031, Q-O09)', ev['coldload_reasons'])
            self.assertIn('provisional (D-031, Q-O09)', ev['structure_reasons'])
            self.assertEqual((ev['coldload_eligible_sensitivity'], ev['structure_eligible_sensitivity']),
                             (plain['coldload_eligible'], plain['structure_eligible']), cid)
            self.assertEqual(ev['structure_reasons_sensitivity'], plain['structure_reasons'], cid)
        for cid, ev in RESULTS.items():
            if not ev['provisional']:
                self.assertEqual((ev['coldload_eligible'], ev['structure_eligible']),
                                 (ev['coldload_eligible_sensitivity'], ev['structure_eligible_sensitivity']), cid)

    def test_8c_coverage_is_reported_for_both_populations(self):
        unconditional = elig.coverage(CAPTURES, RESULTS)
        sensitivity = elig.coverage(CAPTURES, RESULTS, sensitivity=True)
        env = unconditional['enviory']
        self.assertEqual((env['coldload_n'], len(env['coldload']), env['structure_n'], len(env['structure'])), (0, 0, 0, 0))
        self.assertEqual(len(sensitivity['enviory']['coldload']), 6)
        for competitor in unconditional:
            if competitor != 'enviory':
                self.assertEqual(unconditional[competitor], sensitivity[competitor], competitor)

    def test_8d_invalid_provisional_rows_are_errors_and_still_exclude(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = write_provisional(tmp, [
                provisional_row('C-WEV-101', question='Q-9'),        # malformed question id
                provisional_row('C-WEV-102', decision=''),           # empty decision
                provisional_row('C-WEV-103', reason=''),             # empty reason
                provisional_row('C-ZZZ-999'),                        # unknown capture
                provisional_row('WEV-104'),                          # malformed capture id
                provisional_row('C-WEV-105'), provisional_row('C-WEV-105'),  # duplicate
            ])
            register = elig.load_register(known_ids=set(BY_ID), provisional_path=path)
        messages = {}
        for level, cid, message in register.problems:
            messages.setdefault((level, cid), []).append(message)
        for cid, fragment in [('C-WEV-101', 'is not a Q-ONN'), ('C-WEV-102', 'is not a D-NNN id'), ('C-WEV-103', 'empty reason'),
                              ('C-ZZZ-999', 'unknown capture id'), ('WEV-104', 'invalid capture_id'), ('C-WEV-105', 'duplicate row')]:
            self.assertTrue(any(fragment in m for m in messages.get(('error', cid), [])), cid)
        results = elig.evaluate_all(CAPTURES, register)
        for cid in ('C-WEV-101', 'C-WEV-102', 'C-WEV-103', 'C-WEV-105'):
            self.assertFalse(results[cid]['coldload_eligible'], cid)
            self.assertTrue(results[cid]['coldload_eligible_sensitivity'], cid)
        self.assertTrue(any(level == 'error' and 'provisional register missing' in message for level, _, message in
                            elig.load_register(provisional_path=os.path.join(tempfile.gettempdir(), 'absent-provisional.csv')).problems))

    def test_8e_summary_rows_carry_both_populations(self):
        env = summarize.row(BY_ID['C-ENV-122'], RESULTS['C-ENV-122'])
        self.assertEqual((env['provisional'], env['provisional_decision'], env['coldload_eligible'], env['coldload_eligible_sensitivity'],
                          env['structure_eligible_sensitivity']), (True, 'D-031 / Q-O09', False, True, True))
        self.assertIn('provisional (D-031, Q-O09)', env['eligibility_reasons'])
        wev = summarize.row(BY_ID['C-WEV-104'], RESULTS['C-WEV-104'])
        self.assertEqual((wev['provisional'], wev['coldload_eligible'], wev['coldload_eligible_sensitivity']), (False, True, True))

    def test_8f_digest_masks_provisional_values_unless_sensitivity_is_asked(self):
        ids = ['C-ENV-122', 'C-ENV-123']
        plain = subprocess.run([sys.executable, '-B', DIGEST, '--competitor', 'enviory'] + ids, capture_output=True, text=True, check=True)
        self.assertIn('No eligible capture: no median', plain.stdout)
        self.assertNotIn('SENSITIVITY RESULT', plain.stdout)
        for line in (l for l in plain.stdout.splitlines() if l.startswith('| C-ENV-12')):
            self.assertNotRegex(line.split('|', 4)[4], r'\d', 'provisional rows print no numbers in the unconditional digest')
        sens = subprocess.run([sys.executable, '-B', DIGEST, '--competitor', 'enviory', '--sensitivity'] + ids,
                              capture_output=True, text=True, check=True)
        self.assertIn('SENSITIVITY RESULT', sens.stdout)
        self.assertIn('Median of 2 theme(s)', sens.stdout)
        rows = [l for l in sens.stdout.splitlines() if l.startswith('| C-ENV-12')]
        self.assertEqual(len(rows), 4)
        self.assertTrue(all('| yes (provisional: D-031 / Q-O09) |' in l for l in rows))


class Privacy(unittest.TestCase):
    FIXTURES = [
        {'title': 'Budi & Sari | Undangan Pernikahan', 'headings': ['Budi & Sari', 'Save the Date'], 'buttons': ['Buka Undangan', '@budisari_wedding']},
        {'title': 'The Wedding of Budi Santoso & Sari Lestari by Vendor', 'headings': ['Akad Nikah'], 'buttons': ['Budi Santoso']},
        {'title': 'Wanita & Pria — Undangan Digital', 'headings': ['Wanita & Pria'], 'buttons': ['Buka']},
        {'title': 'Groom & Bride - Wedding', 'headings': ['Our Story'], 'buttons': ['@vendor_official']},
    ]

    @staticmethod
    def summary(fixture):
        return {'id': 'C-ZZZ-900', 'competitor': 'fixture', 'kind': 'demo', 'url': 'https://example.invalid/demo',
                'structure': {'afterOpen': {'title': fixture['title'], 'sections': [{'heading': h} for h in fixture['headings']],
                                            'buttons': list(fixture['buttons'])},
                              'beforeOpen': {'buttons': list(fixture['buttons'])}}}

    def test_6_names_are_redacted_and_generic_placeholders_stay(self):
        out = []
        for fixture in self.FIXTURES:
            summary = self.summary(fixture)
            redact.redact_summary(summary)
            out.append(summary['structure']['afterOpen'])
        self.assertEqual(out[0]['title'], '[name] & [name] | Undangan Pernikahan')
        self.assertEqual([s['heading'] for s in out[0]['sections']], ['[name] & [name]', 'Save the Date'])
        self.assertEqual(out[0]['buttons'], ['Buka Undangan', '@[handle]'])
        self.assertEqual(out[1]['title'], 'The Wedding of [name] [name] & [name] [name] by Vendor')
        self.assertEqual(out[1]['buttons'], ['[name] [name]'])
        self.assertEqual(out[2]['title'], 'Wanita & Pria — Undangan Digital')
        self.assertEqual(out[2]['sections'][0]['heading'], 'Wanita & Pria')
        self.assertEqual(out[3]['title'], 'Groom & Bride - Wedding')
        self.assertEqual(out[3]['buttons'], ['@vendor_official'])
        own = self.summary(self.FIXTURES[0])
        own['competitor'] = 'invitesion'
        self.assertFalse(redact.in_scope(own))
        self.assertTrue(redact.in_scope(self.summary(self.FIXTURES[0])))

    def test_6b_python_and_capture_time_js_agree(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('node not on PATH')
        structures = [self.summary(f)['structure'] for f in self.FIXTURES]
        script = (f"import {{ redactDemoNames }} from {json.dumps('file://' + PSEUDONYMIZE)};"
                  "const input = JSON.parse(await new Promise(r => { let s = ''; process.stdin.on('data', d => s += d);"
                  " process.stdin.on('end', () => r(s)); }));"
                  "process.stdout.write(JSON.stringify(input.map(s => redactDemoNames(s))));")
        run = subprocess.run([node, '--input-type=module', '-e', script], input=json.dumps(structures),
                             capture_output=True, text=True, check=True)
        expected = []
        for fixture in self.FIXTURES:
            summary = self.summary(fixture)
            redact.redact_summary(summary)
            expected.append(summary['structure'])
        self.assertEqual(json.loads(run.stdout), expected)


class MeasurementSources(unittest.TestCase):
    def test_7_derived_values_trace_to_their_raw_source(self):
        for capture in CAPTURES:
            r = summarize.row(capture, RESULTS[capture['id']])
            lh, net = capture.get('lighthouse') or {}, capture.get('network') or {}
            self.assertEqual(r['lh_bytes'], lh.get('totalBytes'), capture['id'])
            self.assertEqual(r['lh_requests'], lh.get('requests'), capture['id'])
            self.assertEqual(r['cdp_visit_bytes'], net.get('bytes'), capture['id'])
            self.assertEqual(r['cdp_visit_requests'], net.get('requests'), capture['id'])
            if lh.get('totalBytes') is not None:
                self.assertEqual(r['lh_kib'], round(lh['totalBytes'] / 1024), capture['id'])
            self.assertEqual(r['cdp_visit_kib'], round(net['bytes'] / 1024), capture['id'])
            self.assertEqual(r['perf'], (lh.get('scores') or {}).get('performance'), capture['id'])

    def test_7b_committed_summary_is_current(self):
        path = os.path.join(elig.RESEARCH, '04-template-benchmarks', 'captures-summary.csv')
        with tempfile.TemporaryDirectory() as tmp:
            fresh = os.path.join(tmp, 'summary.csv')
            subprocess.run([sys.executable, '-B', SUMMARIZE, '--out', fresh], capture_output=True, text=True, check=True)
            with open(fresh, encoding='utf-8') as a, open(path, encoding='utf-8') as b:
                self.assertEqual(a.read(), b.read(), 'captures-summary.csv is stale: re-run summarize-captures.py')

    def test_7c_recorded_comparisons_reproduce_from_lighthouse_fields(self):
        wev = [(RESULTS[c]['theme_key'], BY_ID[c]) for c in IDS('C-WEV', range(101, 107)) if RESULTS[c]['coldload_eligible']]
        lh_kib = lambda c: c['lighthouse']['totalBytes'] / 1024
        median_lh, themes, _ = elig.theme_median(wev, lh_kib)
        median_cdp, _, _ = elig.theme_median(wev, lambda c: c['network']['bytes'] / 1024)
        self.assertEqual(themes, 6)
        self.assertAlmostEqual(median_lh, 3447.7, delta=0.1)
        self.assertNotAlmostEqual(median_lh, median_cdp, delta=10, msg='Lighthouse and CDP totals are different sources')
        self.assertEqual(elig.theme_median(wev, lambda c: c['lighthouse']['scores']['performance'])[0], 40)
        self.assertAlmostEqual(elig.theme_median(wev, lambda c: c['lighthouse']['metrics']['lcpMs'])[0], 17407.6, delta=0.1)
        self.assertAlmostEqual(elig.theme_median(wev, lambda c: c['lighthouse']['metrics']['tbtMs'])[0], 981.75)
        self.assertAlmostEqual(median_lh / lh_kib(BY_ID['C-INV-005']), 10.74, delta=0.005)
        self.assertEqual([c for c in BY_ID if c.startswith('C-ENV') and RESULTS[c]['coldload_eligible']], [],
                         'Enviory has no unconditional cold-load sample while Q-O09 is open (D-031)')
        env = [(RESULTS[c]['theme_key'], c) for c in BY_ID if c.startswith('C-ENV') and RESULTS[c]['coldload_eligible_sensitivity']]
        get = lambda path: (lambda cid: path(BY_ID[cid]['lighthouse']))
        self.assertEqual(elig.theme_median(env, get(lambda l: l['scores']['performance']))[:2], (42, 6))
        self.assertAlmostEqual(elig.theme_median(env, get(lambda l: l['metrics']['lcpMs']))[0] / 1000, 13.87, delta=0.005)
        self.assertEqual(round(elig.theme_median(env, get(lambda l: l['totalBytes'] / 1024))[0]), 2404)


if __name__ == '__main__':
    unittest.main(verbosity=2)
