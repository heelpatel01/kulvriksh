import { Notice } from '../ui/primitives';

/** Marks a screen whose feature is not built yet: it shows fixtures and changes nothing real. */
export function SampleDataNotice() {
  return (
    <Notice tone="warning" title="Sample data">
      This screen is a preview of a feature that is not built yet. It shows sample data and does not read or change real
      records.
    </Notice>
  );
}
