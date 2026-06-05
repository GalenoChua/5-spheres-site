const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); } });
  }, { threshold: .15 });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  // stagger hero
  document.querySelectorAll('header .reveal').forEach((el, i) => { el.style.transitionDelay = (i * .12) + 's'; });
