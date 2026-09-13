/* ── The drill schedule ───────────────────────────────────────────────────
   One place. The dates were already written out by hand on the homepage band
   and again on the drills board, and putting them in a third place would have
   meant three things to remember and two of them going quietly stale.

   Anything that shows "the next drill" as a signpost reads from here. The
   drills board itself still carries its own copy, because each card there has
   real per-drill writing around it — that one is worth migrating next, not
   worth faking now.

   A drill is still "next" on the day it runs. It drops off the following
   midnight, local time, which is the right behaviour for someone in Warsaw
   checking on the morning of.

   Times carry their own zone label rather than being computed: the clocks go
   back on 25 October 2026, so November is CET where September and October are
   CEST, and a label is honest where an offset would need maintaining.
   ─────────────────────────────────────────────────────────────────────── */
(function (w) {
  var DRILLS = [
    { on: '2026-09-17', time: '09:00 CEST', title: 'The Sensing Drill',
      price: 'free', href: '/events/the-sensing-drill/' },
    { on: '2026-10-22', time: '09:00 CEST', title: 'The Empathy Map',
      price: '€50', href: '/skilldrills/#request' },
    { on: '2026-11-05', time: '09:00 CET', title: 'Active Listening & The Unsaid',
      price: '€50', href: '/skilldrills/#request' }
  ];

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /* Built from parts rather than Date.parse: an ISO date string is treated as
     UTC, which in Warsaw puts a 09:00 drill on the previous day. */
  function toDate(iso) {
    var p = iso.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function label(iso) {
    var d = toDate(iso);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  /* Every drill that has not happened yet, soonest first. */
  function upcoming() {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return DRILLS.filter(function (d) { return toDate(d.on) >= today; })
                 .sort(function (a, b) { return toDate(a.on) - toDate(b.on); });
  }

  w.Drills = {
    all: DRILLS,
    upcoming: upcoming,
    next: function () { return upcoming()[0] || null; },
    label: label
  };
})(window);
