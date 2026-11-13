import { AuthPage } from './AuthPage';

/**
 * NexusFlow Sign Up page wrapper defaulting to the operator registration view.
 */
export function SignUpPage() {
  return <AuthPage defaultMode="signup" />;
}
