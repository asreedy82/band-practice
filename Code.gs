/**
 * Band Practice Scheduler - backend
 * Google Apps Script bound to a Google Sheet. Deploy as a Web App
 * (Execute as: Me, Who has access: Anyone). See README.md.
 *
 * Optional Script Properties (Project Settings > Script Properties):
 *   BAND_CODE    - a shared passcode members enter once on their phone
 *   CALENDAR_ID  - band Google Calendar ID; confirmed practices get added to it.
 *                  Events on it with the word "DNB" in the title (any case) mark
 *                  do-not-book days; the app shows a warning on those dates.
 */

const CONFIG = {
  MEMBERS: [
    'Paul Withers',
    'Cara Jeanne',
    'Matt Poland',
    'Dave Greene',
    'Matt Duda',
    'Anthony Reedy',
  ],
  EVENT_TITLE: 'Band practice',
  EVENING_START: '19:00',   // 24h, script time zone
  AFTERNOON_START: '13:00',
  DURATION_HOURS: 3,
  DNB_PATTERN: /\bdnb\b/i,   // whole word "DNB", any capitalization
  DNB_DAYS_AHEAD: 120,        // how far ahead to look for DNB events
};

const DATE_HEADERS = ['id', 'date', 'slot', 'note', 'proposedBy', 'createdAt', 'confirmed', 'confirmedSlot', 'eventId'];
const VOTE_HEADERS = ['dateId', 'member', 'vote', 'updatedAt'];
const SLOTS = ['evening', 'afternoon', 'open'];
const VOTES = ['yes', 'maybe', 'no', 'aft', 'eve'];

/* ---------- entry points ---------- */

function doGet(e) {
  return handle_((e && e.parameter) || {});
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ error: 'bad_request' });
  }
  return handle_(body);
}

function handle_(req) {
  try {
    const props = PropertiesService.getScriptProperties();
    const bandCode = (props.getProperty('BAND_CODE') || '').trim().toLowerCase();
    if (bandCode && String(req.code || '').trim().toLowerCase() !== bandCode) {
      return json_({ error: 'unauthorized' });
    }

    const action = req.action || 'list';
    if (action === 'list') return json_(state_());

    if (CONFIG.MEMBERS.indexOf(req.member) === -1) return json_({ error: 'unknown_member' });

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      switch (action) {
        case 'addDates': addDates_(req); break;
        case 'vote': vote_(req.dateId, req.member, req.vote); break;
        case 'confirm': confirm_(req); break;
        case 'unconfirm': unconfirm_(req); break;
        case 'remove': remove_(req); break;
        default: return json_({ error: 'unknown_action' });
      }
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return json_(state_());
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

/* ---------- actions ---------- */

function addDates_(req) {
  const list = Array.isArray(req.dates) ? req.dates.slice(0, 20) : [];
  const note = String(req.note || '').slice(0, 200);
  const sh = datesSheet_();
  const existing = rows_(sh);
  const now = new Date().toISOString();

  list.forEach(function (d) {
    const date = String(d.date || '');
    const slot = SLOTS.indexOf(d.slot) === -1 ? 'evening' : d.slot;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    let row = existing.find(function (r) { return normDate_(r.date) === date && r.slot === slot; });
    let id;
    if (row) {
      id = String(row.id); // already on the table, just count the proposer in
    } else {
      id = Utilities.getUuid().slice(0, 8);
      sh.appendRow([id, date, slot, note, req.member, now, '', '', '']);
      existing.push({ id: id, date: date, slot: slot });
    }
    vote_(id, req.member, 'yes');
  });
}

function vote_(dateId, member, vote) {
  const sh = votesSheet_();
  const rows = rows_(sh);
  const row = rows.find(function (r) { return String(r.dateId) === String(dateId) && r.member === member; });
  const clear = !vote || VOTES.indexOf(vote) === -1;

  if (row && clear) {
    sh.deleteRow(row._row);
  } else if (row) {
    sh.getRange(row._row, 3, 1, 2).setValues([[vote, new Date().toISOString()]]);
  } else if (!clear) {
    sh.appendRow([String(dateId), member, vote, new Date().toISOString()]);
  }
}

function confirm_(req) {
  const sh = datesSheet_();
  const row = findDate_(sh, req.dateId);
  if (!row) throw new Error('not_found');

  let slot = row.slot;
  if (slot === 'open') slot = req.slot === 'afternoon' ? 'afternoon' : 'evening';

  if (row.eventId) deleteEvent_(row.eventId);
  const eventId = createEvent_(normDate_(row.date), slot, row.note);
  setCells_(sh, row._row, { confirmed: 'yes', confirmedSlot: slot, eventId: eventId });
}

function unconfirm_(req) {
  const sh = datesSheet_();
  const row = findDate_(sh, req.dateId);
  if (!row) return;
  if (row.eventId) deleteEvent_(row.eventId);
  setCells_(sh, row._row, { confirmed: '', confirmedSlot: '', eventId: '' });
}

function remove_(req) {
  const ds = datesSheet_();
  const row = findDate_(ds, req.dateId);
  if (!row) return;
  if (row.eventId) deleteEvent_(row.eventId);

  const vs = votesSheet_();
  rows_(vs)
    .filter(function (v) { return String(v.dateId) === String(req.dateId); })
    .map(function (v) { return v._row; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (r) { vs.deleteRow(r); });

  ds.deleteRow(row._row);
}

/* ---------- state ---------- */

function state_() {
  const dates = rows_(datesSheet_())
    .filter(function (r) { return r.id; })
    .map(function (r) {
      return {
        id: String(r.id),
        date: normDate_(r.date),
        slot: SLOTS.indexOf(r.slot) === -1 ? 'evening' : r.slot,
        note: String(r.note || ''),
        proposedBy: String(r.proposedBy || ''),
        createdAt: String(r.createdAt || ''),
        confirmed: String(r.confirmed).toLowerCase() === 'yes' || r.confirmed === true,
        confirmedSlot: String(r.confirmedSlot || ''),
        onCalendar: !!r.eventId,
      };
    });

  const votes = rows_(votesSheet_())
    .filter(function (r) { return r.dateId && r.member; })
    .map(function (r) {
      return { dateId: String(r.dateId), member: String(r.member), vote: String(r.vote) };
    });

  return {
    members: CONFIG.MEMBERS,
    dates: dates,
    votes: votes,
    calendar: !!PropertiesService.getScriptProperties().getProperty('CALENDAR_ID'),
    dnb: dnbMap_(dates),
  };
}

/* ---------- calendar ---------- */

function calendar_() {
  const id = PropertiesService.getScriptProperties().getProperty('CALENDAR_ID');
  return id ? CalendarApp.getCalendarById(id) : null;
}

/**
 * Returns { 'YYYY-MM-DD': ['event title', ...] } for every day covered by a
 * band-calendar event whose title contains the word DNB. Covers today through
 * DNB_DAYS_AHEAD days out, or the latest proposed date if that's further.
 * Warning only: nothing is blocked. Calendar errors never break the app.
 */
function dnbMap_(dates) {
  const out = {};
  try {
    const cal = calendar_();
    if (!cal) return out;
    const tz = Session.getScriptTimeZone();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    let end = new Date(start.getTime() + CONFIG.DNB_DAYS_AHEAD * 86400000);
    (dates || []).forEach(function (d) {
      const p = d.date.split('-').map(Number);
      const after = new Date(p[0], p[1] - 1, p[2] + 1);
      if (after > end) end = after;
    });

    cal.getEvents(start, end).forEach(function (ev) {
      const title = ev.getTitle() || '';
      if (!CONFIG.DNB_PATTERN.test(title)) return;
      let from, to; // [from, to) day range
      if (ev.isAllDayEvent()) {
        from = ev.getAllDayStartDate();
        to = ev.getAllDayEndDate(); // exclusive
      } else {
        from = ev.getStartTime();
        to = ev.getEndTime();
        if (to.getTime() === from.getTime()) to = new Date(from.getTime() + 1);
      }
      const day = new Date(from); day.setHours(0, 0, 0, 0);
      for (let i = 0; day < to && i < 366; i++) {
        const key = Utilities.formatDate(day, tz, 'yyyy-MM-dd');
        (out[key] = out[key] || []).indexOf(title) === -1 && out[key].push(title);
        day.setDate(day.getDate() + 1);
      }
    });
  } catch (err) { /* calendar unavailable: just skip the warnings */ }
  return out;
}

function createEvent_(date, slot, note) {
  const cal = calendar_();
  if (!cal) return '';
  const p = date.split('-').map(Number);
  const t = (slot === 'afternoon' ? CONFIG.AFTERNOON_START : CONFIG.EVENING_START).split(':').map(Number);
  const start = new Date(p[0], p[1] - 1, p[2], t[0], t[1]);
  const end = new Date(start.getTime() + CONFIG.DURATION_HOURS * 3600 * 1000);
  const ev = cal.createEvent(CONFIG.EVENT_TITLE, start, end, { description: note || '' });
  return ev.getId();
}

function deleteEvent_(eventId) {
  try {
    const cal = calendar_();
    const ev = cal && cal.getEventById(eventId);
    if (ev) ev.deleteEvent();
  } catch (err) { /* already gone */ }
}

/* ---------- sheet helpers ---------- */

function datesSheet_() { return sheet_('Dates', DATE_HEADERS); }
function votesSheet_() { return sheet_('Votes', VOTE_HEADERS); }

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange('A:Z').setNumberFormat('@'); // keep dates as plain text
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(sh) {
  const values = sh.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.map(function (r, i) {
    const o = { _row: i + 2 };
    headers.forEach(function (h, j) { o[h] = r[j]; });
    return o;
  });
}

function findDate_(sh, id) {
  return rows_(sh).find(function (r) { return String(r.id) === String(id); });
}

function setCells_(sh, rowNum, obj) {
  Object.keys(obj).forEach(function (k) {
    const col = DATE_HEADERS.indexOf(k) + 1;
    if (col > 0) sh.getRange(rowNum, col).setValue(obj[k]);
  });
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create the tabs and grant permissions. */
function setup() {
  datesSheet_();
  votesSheet_();
  calendar_();
  Logger.log(JSON.stringify(state_()));
}
