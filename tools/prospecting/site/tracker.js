// Bay Area care-home tracker: reads homes and saves outreach notes in Supabase.
// config.js (written by the Pages workflow) sets window.TRACKER_CONFIG.
const STATUSES = [
	'New',
	'Called - no answer',
	'Called - spoke',
	'Left message',
	'Emailed',
	'Visit planned',
	'Visited',
	'Interested',
	'Demo booked',
	'Not interested',
	'Do not contact'
];
const PRIORITIES = ['', 'A - hot', 'B - warm', 'C - later'];
const GROUPS = {
	idd: 'DD group homes & ICF/DD',
	nursing: 'Nursing homes',
	elderly: 'Assisted living',
	day: 'Adult day programs',
	other: 'Other'
};
const TRACK = [
	'status',
	'priority',
	'contact_name',
	'contact_email',
	'first_contact',
	'last_contact',
	'visit_date',
	'next_step',
	'notes'
];
const PAGE = 40;
const $ = (id) => document.getElementById(id);
const esc = (s) =>
	String(s ?? '').replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
	);
const digits = (p) => String(p || '').replace(/\D/g, '');

let sb = null,
	homes = [],
	outreach = {},
	shown = PAGE,
	saving = {};
const o = (h) => outreach[h.home_key] || {};

function filtered() {
	const q = $('q').value.trim().toLowerCase(),
		g = $('fgroup').value,
		c = $('fcounty').value,
		s = $('fstatus').value;
	const list = homes.filter((h) => {
		const x = o(h),
			st = x.status || 'New';
		if (!$('fgone').checked && !h.still_listed) return false;
		if (g && h.grp !== g) return false;
		if (c && h.county !== c) return false;
		if (s && st !== s) return false;
		if ($('fnew').checked && st !== 'New') return false;
		if ($('femail').checked && !(h.email || x.contact_email)) return false;
		if (q) {
			const hay = [
				h.facility_name,
				h.licensee_owner,
				h.cms_legal_business_name,
				h.cms_owners,
				h.administrator,
				h.city,
				h.address,
				x.notes,
				x.contact_name
			]
				.join(' ')
				.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
	const by = {
		city: (a, b) =>
			(a.county + a.city + a.facility_name).localeCompare(b.county + b.city + b.facility_name),
		name: (a, b) => a.facility_name.localeCompare(b.facility_name),
		beds: (a, b) => (+b.capacity || 0) - (+a.capacity || 0),
		recent: (a, b) => (o(b).last_contact || '').localeCompare(o(a).last_contact || '')
	}[$('fsort').value];
	return list.sort(by);
}

function card(h) {
	const x = o(h),
		st = x.status || 'New';
	const em = (x.contact_email || h.email || '').split(';')[0].trim(),
		ph = digits(h.phone);
	const addr = [h.address, h.city, 'CA', h.zip].filter(Boolean).join(', ');
	const maps = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addr);
	const opt = (arr, v) =>
		arr.map((a) => `<option ${a === v ? 'selected' : ''}>${esc(a)}</option>`).join('');
	const id = (f) => `${esc(h.home_key)}-${f}`;
	const owner = h.licensee_owner || '—';
	return `<article class="card" data-key="${esc(h.home_key)}">
  <div class="top"><div><div class="name">${esc(h.facility_name)}</div>
  <div class="kind">${esc(h.facility_type)}${h.capacity ? ` · ${esc(h.capacity)} beds` : ''}</div>
  ${h.still_listed ? '' : '<div class="gone">No longer on the state list</div>'}</div>
  <span class="status" data-s="${esc(st)}">${esc(st)}</span></div>
  <div class="acts"><a class="${ph ? '' : 'na'}" href="tel:${ph}">Call</a>
   <a class="${em ? '' : 'na'}" href="mailto:${esc(em)}">Email</a>
   <a target="_blank" rel="noopener" href="${maps}">Directions</a></div>
  <dl><dt>Owner</dt><dd>${esc(owner)}${h.cms_legal_business_name && h.cms_legal_business_name !== owner ? ` (${esc(h.cms_legal_business_name)})` : ''}</dd>
  ${h.cms_owners ? `<dt>Owners</dt><dd>${esc(h.cms_owners)}</dd>` : ''}
  <dt>Administrator</dt><dd>${esc(h.administrator || '—')}</dd>
  <dt>Address</dt><dd>${esc(addr)}${h.county ? ` · ${esc(h.county)}` : ''}</dd>
  <dt>Phone</dt><dd>${esc(h.phone || '—')}</dd><dt>Email</dt><dd>${esc(h.email || '—')}</dd></dl>
  <details ${x.notes || st !== 'New' ? 'open' : ''}><summary>Outreach</summary><div class="grid">
   <label>Status<select id="${id('status')}" data-f="status">${opt(STATUSES, st)}</select></label>
   <label>Priority<select id="${id('priority')}" data-f="priority">${opt(PRIORITIES, x.priority || '')}</select></label>
   <label>Person you spoke to<input id="${id('contact_name')}" data-f="contact_name" value="${esc(x.contact_name)}"></label>
   <label>Their email<input id="${id('contact_email')}" type="email" data-f="contact_email" value="${esc(x.contact_email)}"></label>
   <label>Visit date<input id="${id('visit_date')}" type="date" data-f="visit_date" value="${esc(x.visit_date)}"></label>
   <label>Last contact<input id="${id('last_contact')}" type="date" data-f="last_contact" value="${esc(x.last_contact)}"></label>
   <label class="full">Next step<input id="${id('next_step')}" data-f="next_step" value="${esc(x.next_step)}"></label>
   <label class="full">Notes<textarea id="${id('notes')}" rows="3" data-f="notes">${esc(x.notes)}</textarea></label>
  </div><div class="saved" aria-live="polite"></div></details></article>`;
}

function render() {
	const list = filtered();
	$('count').textContent = `${list.length} of ${homes.filter((h) => h.still_listed).length}`;
	$('list').innerHTML =
		list.slice(0, shown).map(card).join('') || '<p class="muted">No homes match these filters.</p>';
	$('more').hidden = list.length <= shown;
	const counts = {};
	homes
		.filter((h) => h.still_listed)
		.forEach((h) => {
			const s = o(h).status || 'New';
			counts[s] = (counts[s] || 0) + 1;
		});
	$('stats').innerHTML = STATUSES.filter((s) => counts[s])
		.map((s) => `<span class="chip">${esc(s)}: ${counts[s]}</span>`)
		.join('');
}

async function fetchAll(table, order) {
	const rows = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await sb
			.from(table)
			.select('*')
			.order(order)
			.range(from, from + 999);
		if (error) throw error;
		rows.push(...data);
		if (data.length < 1000) return rows;
	}
}

async function load() {
	$('login').hidden = true;
	$('status').hidden = false;
	$('refreshText').textContent = 'Loading…';
	try {
		const [h, n, log] = await Promise.all([
			fetchAll('homes', 'home_key'),
			fetchAll('outreach', 'home_key'),
			sb.from('refresh_log').select('*').order('ran_at', { ascending: false }).limit(1)
		]);
		homes = h;
		outreach = Object.fromEntries(n.map((r) => [r.home_key, r]));
		if (!homes.length) {
			$('refreshText').textContent =
				"No homes yet. Either the daily refresh hasn't run (run it from GitHub: Actions → Prospecting refresh → Run workflow), or your email isn't in allowed_users.";
			return;
		}
		const last = log.data && log.data[0];
		$('refreshText').textContent = last
			? `Last refresh ${new Date(last.ran_at).toLocaleString()}: ${last.complete ? `${last.homes} homes` : `incomplete, nothing removed (${last.problems})`}.`
			: '';
		const groups = [...new Set(homes.map((x) => x.grp).filter(Boolean))];
		$('fgroup').innerHTML =
			'<option value="">All types</option>' +
			groups.map((g) => `<option value="${esc(g)}">${esc(GROUPS[g] || g)}</option>`).join('');
		const counties = [...new Set(homes.map((x) => x.county).filter(Boolean))].sort();
		$('fcounty').innerHTML =
			'<option value="">All counties</option>' +
			counties.map((c) => `<option>${esc(c)}</option>`).join('');
		$('filters').hidden = false;
		render();
	} catch (e) {
		$('refreshText').textContent =
			"Couldn't load the list: " + (e.message || e) + '. Reload to try again.';
	}
}

function showLogin(msg) {
	$('login').hidden = false;
	$('status').hidden = true;
	$('filters').hidden = true;
	$('list').innerHTML = '';
	$('more').hidden = true;
	$('count').textContent = '';
	if (msg) $('loginMsg').textContent = msg;
}

function wire() {
	$('fstatus').innerHTML =
		'<option value="">Any status</option>' +
		STATUSES.map((s) => `<option>${esc(s)}</option>`).join('');
	['q', 'fgroup', 'fcounty', 'fstatus', 'fsort', 'femail', 'fnew', 'fgone'].forEach((id) =>
		$(id).addEventListener(id === 'q' ? 'input' : 'change', () => {
			shown = PAGE;
			render();
		})
	);
	$('more').addEventListener('click', () => {
		shown += PAGE;
		render();
	});
	$('loginForm').addEventListener('submit', async (e) => {
		e.preventDefault();
		$('loginMsg').textContent = 'Sending…';
		const { error } = await sb.auth.signInWithOtp({
			email: $('email').value.trim(),
			options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false }
		});
		$('loginMsg').textContent = error
			? `Couldn't send the link: ${error.message}`
			: 'Check your email and tap the link (it opens this page).';
	});
	$('signOut').addEventListener('click', async () => {
		await sb.auth.signOut();
		showLogin('');
	});
	$('exportBtn').addEventListener('click', () => {
		const cols = [
			'facility_name',
			'facility_type',
			'licensee_owner',
			'administrator',
			'address',
			'city',
			'zip',
			'county',
			'phone',
			'email',
			...TRACK
		];
		const cell = (v) => {
			let t = String(v ?? '');
			if (/^\s*[=+\-@]/.test(t)) t = "'" + t;
			return '"' + t.replace(/"/g, '""') + '"';
		};
		const lines = [cols.join(',')].concat(
			filtered().map((h) => cols.map((c) => cell(TRACK.includes(c) ? o(h)[c] : h[c])).join(','))
		);
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' }));
		a.download = 'bay_area_care_homes.csv';
		a.click();
	});
	$('list').addEventListener('change', (e) => {
		const el = e.target,
			f = el.dataset.f,
			cardEl = el.closest('.card');
		if (!f || !cardEl) return;
		const key = cardEl.dataset.key,
			msg = cardEl.querySelector('.saved');
		const today = new Date().toISOString().slice(0, 10);
		const body = {
			...(outreach[key] || {}),
			home_key: key,
			[f]: el.value || null,
			updated_at: new Date().toISOString()
		};
		if (f === 'status' && el.value !== 'New') {
			body.last_contact = today;
			if (!body.first_contact) body.first_contact = today;
			const lc = cardEl.querySelector('[data-f="last_contact"]');
			if (lc) lc.value = today;
			const pill = cardEl.querySelector('.status');
			pill.textContent = el.value;
			pill.dataset.s = el.value;
		}
		if (!body.status) body.status = 'New';
		outreach[key] = body;
		msg.textContent = 'Saving…';
		msg.classList.remove('err');
		const payload = Object.fromEntries(
			['home_key', 'updated_at', ...TRACK].map((k) => [k, body[k] ?? null])
		);
		saving[key] = (saving[key] || Promise.resolve())
			.then(() => sb.from('outreach').upsert(payload))
			.then(({ error }) => {
				if (error) throw error;
				msg.textContent = 'Saved';
			})
			.catch((err) => {
				msg.textContent = 'Not saved: ' + (err.message || 'check your connection');
				msg.classList.add('err');
			});
	});
}

(async () => {
	wire();
	const cfg = window.TRACKER_CONFIG || {};
	if (!cfg.url || !cfg.anonKey || !window.supabase) {
		$('list').innerHTML =
			'<p class="muted">This site isn\'t connected to Supabase yet: set the SUPABASE_URL and SUPABASE_ANON_KEY repository variables and run the Pages workflow again.</p>';
		return;
	}
	sb = window.supabase.createClient(cfg.url, cfg.anonKey);
	sb.auth.onAuthStateChange((event, session) => {
		if (event === 'SIGNED_IN' && session && !homes.length) load();
		if (event === 'SIGNED_OUT') showLogin('');
	});
	const { data } = await sb.auth.getSession();
	if (data.session) load();
	else showLogin('');
})();
