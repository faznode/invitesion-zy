import { isFlagOn } from '@/lib/flags';
import { defaultFamilyFor, familyOf } from './families';
import { withNewInvitationGiftDefaults } from './gift-privacy';
import { occasionOf } from './occasion';

type Config = Record<string, unknown>;

const isRecord = (value: unknown): value is Config => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The defaults only a new invitation receives, applied by `createInvitation` to the template's preset. Stored invitations
 * never pass through here, so nothing a host already has changes.
 * - B-026 (D-047): gift details start on personal links only.
 * - F-02 (D-041 (3)), flag `DEFAULT_FAMILY`: the design family chosen for the event type, unless the preset already names
 *   a family that exists. Off leaves the layout to the preset, as before (legacy when it names none).
 */
export function newInvitationConfig(preset: Config, eventType: string, env: Record<string, string | undefined> = process.env): Config {
  const config = withNewInvitationGiftDefaults(preset);
  return isFlagOn('DEFAULT_FAMILY', env) ? withDefaultFamily(config, eventType) : config;
}

/** The event type's family in `theme.familyId`, keeping the rest of the theme (palette, cover) and a valid family already chosen. */
export function withDefaultFamily(config: Config, eventType: string): Config {
  const theme = isRecord(config.theme) ? config.theme : {};
  if (typeof theme.familyId === 'string' && familyOf(theme.familyId)) return config;
  // B-032: the preset's occasion (a memorial) can choose a calmer family than its event type's.
  const familyId = defaultFamilyFor(eventType, occasionOf(config));
  return familyId ? { ...config, theme: { ...theme, familyId } } : config;
}
