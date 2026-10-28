import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/primitives';

export default function CaseNotFound() {
  return (
    <Card>
      <EmptyState
        icon="lock"
        title="This case is not available"
        action={
          <ButtonLink href="/genealogist/cases" variant="secondary">
            Back to assigned families
          </ButtonLink>
        }
      >
        It may not be assigned to you, or the assignment may have ended.
      </EmptyState>
    </Card>
  );
}
