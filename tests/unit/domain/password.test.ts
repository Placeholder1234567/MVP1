import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN, passwordProblem } from '../../../src/lib/domain/password';

describe('passwordProblem', () => {
	it('asks for length only, with no character-type rules', () => {
		expect(passwordProblem('short one')).toMatch(`at least ${PASSWORD_MIN}`);
		expect(passwordProblem('correct horse battery')).toBeNull();
		expect(passwordProblem('alllowercaseletters')).toBeNull();
	});
	it('counts characters, not bytes', () => {
		expect(passwordProblem('🙂'.repeat(PASSWORD_MIN - 1))).toMatch('at least');
		expect(passwordProblem('🙂🌻🍋🌙'.repeat(4))).toBeNull();
	});
	it('rejects too long, one repeated character and the email name', () => {
		expect(passwordProblem('a b c d '.repeat(20))).toMatch('at most');
		expect(passwordProblem('aaaaaaaaaaaaaaaaaaaa')).toMatch('repeated');
		expect(passwordProblem('Maria.Lopez rocks 2026', 'maria.lopez@example.test')).toMatch('email');
	});
});
