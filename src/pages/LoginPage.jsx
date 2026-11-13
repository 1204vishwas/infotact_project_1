import { AuthPage } from './AuthPage';

/**
 * NexusFlow Login page wrapper defaulting to the operator sign-in view.
 */
export function LoginPage() {
  return <AuthPage defaultMode="login" />;
}
