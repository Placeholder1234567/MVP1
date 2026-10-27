import { expect, it } from 'vitest';
import nodemailer from 'nodemailer';

// Stream transport constructs a message in memory: no SMTP connection or delivery.
it.each([
	{
		name: 'ordinary mailbox',
		to: 'Recipient <recipient@example.test>',
		expected: 'recipient@example.test'
	},
	{
		name: 'nested address comment',
		to: 'Recipient (outer(inner) <not-a-recipient@example.test>) <recipient@example.test>',
		expected: 'recipient@example.test'
	},
	{
		name: 'semicolon inside a group comment',
		to: 'G: (a; <not-a-recipient@example.test>) <recipient@example.test>;',
		expected: 'recipient@example.test'
	}
])('keeps the intended SMTP envelope for $name', async ({ to, expected }) => {
	const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
	const result = await transport.sendMail({
		from: 'sender@example.test',
		to,
		subject: 'Synthetic recipient-parser regression',
		text: 'Synthetic content only.'
	});
	expect(result.envelope).toEqual({ from: 'sender@example.test', to: [expected] });
});

// Nodemailer's formatter normalizes angle brackets in local parts. The security
// invariant here is one recipient at the intended domain, not verbatim RFC syntax.
it('does not turn a quoted local part into a different recipient domain', async () => {
	const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
	const result = await transport.sendMail({
		from: 'sender@example.test',
		to: '<"a@unwanted.example>"@recipient.example.test>',
		subject: 'Synthetic recipient-parser regression',
		text: 'Synthetic content only.'
	});
	expect(result.envelope.from).toBe('sender@example.test');
	expect(result.envelope.to).toHaveLength(1);
	expect(result.envelope.to[0]).toMatch(/@recipient\.example\.test$/);
});
