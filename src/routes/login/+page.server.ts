import { demoSignIn } from '#lib/server/demo-accounts.ts';
import type { PageServerLoad } from './$types';

// Local development only: the emulator's synthetic demo accounts (null otherwise).
export const load: PageServerLoad = () => ({ demo: demoSignIn() });
