/* reveal animations (index page) */
const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, { threshold: .15 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  document.querySelectorAll('header .reveal').forEach((el, i) => { el.style.transitionDelay = (i * .12) + 's'; });

/* ── resource download gating ──
   Set GATE_DOWNLOADS to false to disable email gates on all resource downloads.
   When false, gate forms hide and direct download links show. */
var GATE_DOWNLOADS = true;

(function () {
  if (!GATE_DOWNLOADS) {
    document.querySelectorAll('.gate-form').forEach(function (el) { el.style.display = 'none'; });
    document.querySelectorAll('.gate-download').forEach(function (el) { el.style.display = 'block'; });
  }
})();

/* copy-to-clipboard for prompt blocks */
function copyPrompt(btn) {
  var text = btn.parentElement.querySelector('.q').innerText.replace(/^\u201c|\u201d$/g, '').replace(/^"|"$/g, '');
  navigator.clipboard.writeText(text).then(function () {
    var t = document.getElementById('toast');
    if (t) { t.classList.add('show'); }
    var old = btn.innerText; btn.innerText = 'Copied';
    setTimeout(function () { if (t) { t.classList.remove('show'); } btn.innerText = old; }, 1600);
  });
}
