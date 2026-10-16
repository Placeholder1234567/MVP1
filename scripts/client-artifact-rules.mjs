import assert from 'node:assert/strict';

/** Errors deliberately omit matched text, environment values and file contents. */
export function assertPublicPath(path) {
	assert.ok(
		!/\.map(?:\.(?:gz|br))?$|(?:^|\/)\.env(?:\.|$)|\.(?:ts|sql|pem|key)(?:\.(?:gz|br))?$/i.test(
			path.replaceAll('\\', '/')
		),
		'Private source or source map in public build'
	);
}

export function assertPublicText(text, privateValues = []) {
	assert.ok(
		!/sourceMappingURL\s*=|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/.test(
			text
		),
		'Private source or credential marker in public build'
	);
	assert.ok(
		!privateValues.some((value) => text.includes(value)),
		'Configured private value in public build'
	);
}
