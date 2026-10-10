/**
 * WATER EUROPA — Core Interactive Logic & CMS Hydration
 * Hydrates dynamically from db.json if present, supports multi-location plants,
 * interchangeable floating contact widget (WhatsApp / Messenger / Instagram),
 * carousel, scroll reveals, timeline animations, and donation modal.
 */

'use strict';

// Global store for loaded CMS data
window.SITE_DATA = null;

// Built-in official SVGs for floating platforms
const PLATFORM_ICONS = {
  whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="26" height="26">
    <path fill="#fff" d="M4.868 43.303 7.36 34.03A19.4 19.4 0 0 1 4.5 24C4.5 13.23 13.23 4.5 24 4.5S43.5 13.23 43.5 24 34.77 43.5 24 43.5a19.4 19.4 0 0 1-9.614-2.545z"/>
    <path fill="#25d366" d="M24 7.5C14.887 7.5 7.5 14.887 7.5 24c0 3.175.87 6.15 2.382 8.7l.452.73-1.913 6.99 7.19-1.887.703.418A16.44 16.44 0 0 0 24 40.5c9.113 0 16.5-7.387 16.5-16.5S33.113 7.5 24 7.5"/>
    <path fill="#fff" fill-rule="evenodd" d="M19.05 14.914c-.39-.878-.8-.896-1.17-.912-.303-.013-.65-.012-.996-.012-.347 0-.91.13-1.388.65-.477.52-1.822 1.78-1.822 4.34s1.866 5.033 2.127 5.38c.26.347 3.639 5.785 8.94 7.878 4.42 1.743 5.32 1.397 6.28 1.309.96-.087 3.097-1.267 3.533-2.49.435-1.222.435-2.27.304-2.49-.13-.217-.477-.347-.996-.607s-3.097-1.527-3.576-1.701-.828-.26-1.177.26-1.35 1.7-1.655 2.05-.61.39-1.13.13c-.52-.261-2.194-.809-4.18-2.58-1.545-1.378-2.587-3.08-2.892-3.6-.305-.52-.032-.8.228-1.06.234-.232.52-.606.78-.91.26-.303.347-.52.52-.867.174-.347.087-.65-.043-.91-.13-.26-1.134-2.834-1.587-3.858z" clip-rule="evenodd"/>
  </svg>`,
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" fill="#fff">
    <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.513 3.735 7.185v3.557l3.418-1.876c.907.252 1.866.392 2.847.392 5.523 0 10-4.145 10-9.258S17.523 2 12 2zm1.06 12.443l-2.715-2.898-5.297 2.898 5.828-6.185 2.782 2.898 5.23-2.898-5.828 6.185z"/>
  </svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="26" height="26" fill="#fff">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>`
};

document.addEventListener('DOMContentLoaded', async () => {

  // 1. Load CMS Content from db.json
  await loadAndHydrateCMS();

  // 2. Initialize UI Features
  initNavbar();
  initCarousel();
  initScrollReveal();
  initDonationTiers();
  initContactForm();
  initMobileNav();
  initTimeline();
  initPlantsSection();

  // Audit view toggle support
  if (new URLSearchParams(location.search).has('audit')) {
    document.body.classList.add('audit');
  }
});

// ─────────────────────────────────────────────────────────────
// CMS HYDRATION ENGINE
// ─────────────────────────────────────────────────────────────
async function loadAndHydrateCMS() {
  try {
    const res = await fetch('./db.json?v=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    window.SITE_DATA = data;

    // Apply Branding & Document metadata
    if (data.branding) {
      if (data.branding.siteTitle) document.title = data.branding.siteTitle;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && data.branding.metaDescription) metaDesc.content = data.branding.metaDescription;

      // Logo
      if (data.branding.logoUrl) {
        document.querySelectorAll('img[alt*="Water Europa Logo"]').forEach(img => {
          img.src = data.branding.logoUrl;
        });
      }

      // Footer Credit (Configurable Codem portfolio credit)
      const footerCredit = document.getElementById('footer-credit');
      if (footerCredit) {
        const text = data.branding.footerCreditText || 'Designed by';
        const author = data.branding.footerCreditAuthor || 'Codem';
        const url = data.branding.footerCreditUrl || 'https://portfolio-future-nine.vercel.app';
        footerCredit.innerHTML = `${text} <a id="footer-credit-link" href="${url}" target="_blank" rel="noopener noreferrer" class="text-secondary-container hover:underline font-medium">${author}</a>`;
      }
      const footerTagline = document.getElementById('footer-tagline');
      if (footerTagline && data.branding.footerTagline != null) {
        footerTagline.textContent = data.branding.footerTagline;
      }
    }

    // Apply Floating Contact Button
    applyFloatingWidget(data.floatingWidget);

    // Apply Contact Details
    if (data.contact) {
      if (data.contact.formspreeUrl) {
        const form = document.getElementById('inquiry-form');
        if (form) form.action = data.contact.formspreeUrl;
      }
      if (data.contact.email) {
        document.querySelectorAll('[data-admin="contact-email"]').forEach(el => {
          el.href = 'mailto:' + data.contact.email;
          el.textContent = data.contact.email;
        });
      }
    }

    // Apply Founders Custom Object Positions & Photos
    if (data.story && Array.isArray(data.story.founders)) {
      hydrateFounders(data.story.founders);
    }

    // Apply editable photos (hero carousel, crisis, gallery) and donation block
    hydrateMedia(data);
    hydrateParallaxBackgrounds(data.parallaxBackgrounds);
    hydrateDonation(data.donation);

    // Handle enabled/disabled toggleable blocks
    hydrateCrisisBlocks(data.crisis);
    hydrateAntiscalantNote(data.kashmore);

  } catch (err) {
    console.warn('Could not hydrate db.json; using built-in HTML content.', err);
  }
}

// Toggle crisis stat blocks based on enabled flags
function hydrateCrisisBlocks(crisis) {
  if (!crisis) return;
  const stat1Wrap = document.getElementById('crisis-stat1-wrap');
  const stat2Wrap = document.getElementById('crisis-stat2-wrap');
  if (stat1Wrap) stat1Wrap.style.display = crisis.stat1?.enabled === false ? 'none' : '';
  if (stat2Wrap) stat2Wrap.style.display = crisis.stat2?.enabled === false ? 'none' : '';

  // Update text if present
  const s1label = document.getElementById('crisis-stat1-label');
  const s1value = document.getElementById('crisis-stat1-value');
  const s1sub   = document.getElementById('crisis-stat1-sub');
  const s2label = document.getElementById('crisis-stat2-label');
  const s2value = document.getElementById('crisis-stat2-value');
  const s2sub   = document.getElementById('crisis-stat2-sub');
  if (crisis.stat1) {
    if (s1label && crisis.stat1.label) s1label.textContent = crisis.stat1.label;
    if (s1value && crisis.stat1.value) s1value.textContent = crisis.stat1.value;
    if (s1sub   && crisis.stat1.sub)   s1sub.textContent   = crisis.stat1.sub;
  }
  if (crisis.stat2) {
    if (s2label && crisis.stat2.label) s2label.textContent = crisis.stat2.label;
    if (s2value && crisis.stat2.value) s2value.textContent = crisis.stat2.value;
    if (s2sub   && crisis.stat2.sub)   s2sub.textContent   = crisis.stat2.sub;
  }
}

// Toggle antiscalant note block based on enabled flag
function hydrateAntiscalantNote(kashmore) {
  if (!kashmore) return;
  const wrap = document.getElementById('antiscalant-note-wrap');
  if (!wrap) return;
  const tp = kashmore.treatmentProcess;
  if (!tp) return;
  wrap.style.display = tp.antiscalantNoteEnabled === false ? 'none' : '';
  const noteText = wrap.querySelector('p');
  if (noteText && tp.antiscalantNote) noteText.innerHTML = tp.antiscalantNote;
}

// Hydrate Floating Widget (WhatsApp / Messenger / Instagram)
function applyFloatingWidget(widget) {
  if (!widget) return;
  const btn = document.getElementById('floating-contact-btn') || document.querySelector('.floating-wa-btn');
  if (!btn) return;

  if (widget.enabled === false) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'flex';

  const platform = (widget.platform || 'whatsapp').toLowerCase();
  const handle = widget.numberOrHandle || '';
  const msg = widget.message || 'Hello Water Europa team!';
  const label = widget.label || 'Chat with us';

  // Clear existing classes
  btn.classList.remove('platform-facebook', 'platform-instagram', 'platform-whatsapp');
  btn.classList.add(`platform-${platform}`);

  // Set link
  if (platform === 'whatsapp') {
    const cleanNum = handle.replace(/[^\d]/g, '');
    btn.href = `https://wa.me/${cleanNum}?text=${encodeURIComponent(msg)}`;
    btn.setAttribute('aria-label', 'Chat on WhatsApp');
  } else if (platform === 'facebook') {
    btn.href = `https://m.me/${encodeURIComponent(handle)}`;
    btn.setAttribute('aria-label', 'Chat on Facebook Messenger');
  } else if (platform === 'instagram') {
    const cleanHandle = handle.replace(/^@/, '');
    btn.href = `https://ig.me/m/${encodeURIComponent(cleanHandle)}`;
    btn.setAttribute('aria-label', 'Message on Instagram');
  }

  // Set Icon
  const iconSpan = btn.querySelector('.floating-wa-icon');
  if (iconSpan) {
    iconSpan.innerHTML = PLATFORM_ICONS[platform] || PLATFORM_ICONS.whatsapp;
  }

  // Set Label
  const labelSpan = btn.querySelector('.floating-wa-label');
  if (labelSpan) {
    labelSpan.textContent = label;
  }
}

// Hydrate Founders Photos & Alignment
function hydrateFounders(founders) {
  founders.forEach(founder => {
    const img = document.querySelector(`img[alt*="${founder.name}"]`);
    if (!img) return;
    if (founder.imageUrl) img.src = founder.imageUrl;
    if (founder.objectPosition) {
      img.style.objectPosition = founder.objectPosition;
    }
    const card = img.closest('.glass-panel');
    const bioEl = card && card.querySelector('.founder-bio');
    if (bioEl && founder.bio) bioEl.textContent = founder.bio;
  });
}

// Build the hero carousel slides & dot indicators from db.json so any number of slides works
function hydrateHeroCarousel(data) {
  const slides = (data.hero && data.hero.carousel) || [];
  const container = document.getElementById('carousel-container');
  const dotsWrap = document.getElementById('carousel-dots');
  if (!container || !slides.length) return;

  container.innerHTML = '';
  slides.forEach((slide, i) => {
    const div = document.createElement('div');
    div.className = 'carousel-slide' + (i === 0 ? ' active' : '');

    const img = document.createElement('img');
    img.src = slide.imageUrl || '';
    img.alt = slide.caption || 'Water Europa';

    const overlay = document.createElement('div');
    overlay.className = 'absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-6 text-white';

    const badge = document.createElement('span');
    badge.className = 'text-xs uppercase font-bold text-secondary-container tracking-wider';
    badge.textContent = slide.badge || '';

    const caption = document.createElement('p');
    caption.className = 'font-serif text-lg font-medium';
    caption.textContent = slide.caption || '';

    overlay.append(badge, caption);
    div.append(img, overlay);
    container.appendChild(div);
  });

  if (dotsWrap) {
    dotsWrap.innerHTML = '';
    slides.forEach((_, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'carousel-bar' + (i === 0 ? ' active' : '');
      btn.setAttribute('aria-label', `Slide ${i + 1}`);
      btn.addEventListener('click', () => { if (window.goToSlide) window.goToSlide(i); });
      dotsWrap.appendChild(btn);
    });
  }
}

// Hydrate hero carousel / crisis / gallery photos from db.json
function hydrateMedia(data) {
  hydrateHeroCarousel(data);

  const crisisImg = document.getElementById('crisis-image');
  const crisis = data.crisis && data.crisis.image;
  if (crisisImg && crisis && crisis.url) {
    crisisImg.src = crisis.url;
    crisisImg.alt = crisis.caption || crisisImg.alt;
  }

  const galleryEl = document.getElementById('kashmore-gallery');
  const gallery = data.kashmore && data.kashmore.gallery;
  if (galleryEl && Array.isArray(gallery) && gallery.length) {
    galleryEl.innerHTML = '';

    const createCard = (item, isClone = false, isMarquee = false) => {
      const card = document.createElement('div');
      card.className = (isMarquee ? 'gallery-marquee-card ' : '') + 'rounded-2xl overflow-hidden border border-outline-variant bg-white shadow-xs' + (isClone ? ' gallery-clone' : '');
      const img = document.createElement('img');
      img.src = item.imageUrl || '';
      img.alt = item.title || 'Water Europa';
      img.className = 'w-full h-36 object-cover';
      const body = document.createElement('div');
      body.className = 'p-3 text-xs';
      const title = document.createElement('span');
      title.className = 'font-bold text-primary block';
      title.textContent = item.title || '';
      const cap = document.createElement('span');
      cap.className = 'text-outline text-[11px]';
      cap.textContent = item.caption || '';
      body.append(title, cap);
      card.append(img, body);
      return card;
    };

    if (gallery.length <= 3) {
      // 3 or fewer items: standard 3-column grid in nice boxes, NO duplicates
      galleryEl.className = 'grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-outline-variant';
      gallery.forEach(item => {
        if (!item || !item.imageUrl) return;
        galleryEl.appendChild(createCard(item, false, false));
      });
    } else {
      // More than 3 items: wrap around with desktop horizontal scrolling animation
      galleryEl.className = 'kashmore-gallery-marquee pt-6 border-t border-outline-variant overflow-hidden';
      const track = document.createElement('div');
      track.className = 'kashmore-marquee-track';

      // Primary items
      gallery.forEach(item => {
        if (!item || !item.imageUrl) return;
        track.appendChild(createCard(item, false, true));
      });

      // Duplicates for desktop infinite loop
      gallery.forEach(item => {
        if (!item || !item.imageUrl) return;
        track.appendChild(createCard(item, true, true));
      });

      galleryEl.appendChild(track);
    }
  }
}

// Hydrate parallax section background images from db.json
function hydrateParallaxBackgrounds(bgs) {
  if (!bgs) return;
  Object.entries(bgs).forEach(([key, cfg]) => {
    const url = cfg && cfg.imageUrl;
    if (!url) return;
    const el = document.querySelector(`[data-parallax-bg="${key}"]`);
    if (el) el.style.backgroundImage = `url('${url}')`;
  });
}

// ─────────────────────────────────────────────────────────────
// DONATION BLOCK (fully driven by db.json "donation")
// ─────────────────────────────────────────────────────────────
const DONATION_DEFAULTS = {
  messageTemplate: 'Hello Water Europa team! I would like to donate {amount}. Please share your payment details.',
  genericMessage: 'Hello Water Europa team! I would like to donate. Please share your payment details.',
  selectedPrefix: 'Selected:'
};

function donationConfig() {
  return Object.assign({}, DONATION_DEFAULTS, (window.SITE_DATA && window.SITE_DATA.donation) || {});
}

// Updates the "Selected" label and the WhatsApp button link for a given amount ('' = generic message)
function applyPledge(amount) {
  const d = donationConfig();
  const label = document.getElementById('selected-tier-label');
  const waBtn = document.getElementById('whatsapp-pledge-btn');
  if (label) label.innerText = amount ? `${d.selectedPrefix} ${amount}` : '';
  const widget = window.SITE_DATA && window.SITE_DATA.floatingWidget;
  const phone = widget && widget.numberOrHandle ? widget.numberOrHandle.replace(/[^\d]/g, '') : '920000000000';
  const text = amount ? d.messageTemplate.split('{amount}').join(amount) : d.genericMessage;
  if (waBtn) waBtn.href = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function hydrateDonation(d) {
  if (!d) return;
  const byId = id => document.getElementById(id);
  const setText = (id, t) => { const el = byId(id); if (el && t) el.textContent = t; };
  setText('donate-title', d.title);
  setText('donate-text', d.text);
  setText('donate-tiers-label', d.tiersLabel);
  setText('donate-helper', d.helperText);
  setText('donate-btn-label', d.buttonLabel);

  const wrap = byId('pledge-tiers');
  const tiersLabel = byId('donate-tiers-label');
  const selLabel = byId('selected-tier-label');
  const custom = byId('pledge-custom');
  const customInput = byId('pledge-custom-input');
  if (!wrap) return;

  if (d.showTiers === false) {
    wrap.style.display = 'none';
    if (tiersLabel) tiersLabel.style.display = 'none';
    if (selLabel) selLabel.style.display = 'none';
    if (custom) custom.classList.add('hidden');
    applyPledge('');
    return;
  }

  // Keep each tier's position in the full list so "default" still points at the right one when others are hidden
  const tiers = (d.tiers || [])
    .map((t, i) => ({ t, i }))
    .filter(x => x.t && x.t.enabled !== false && String(x.t.amount || '').trim());
  wrap.innerHTML = '';
  tiers.forEach(({ t, i }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tier-chip';
    const amt = document.createElement('span');
    amt.className = 'font-serif text-lg font-bold text-primary block';
    amt.textContent = t.amount;
    btn.appendChild(amt);
    if (t.note) {
      const note = document.createElement('span');
      note.className = 'text-[11px] text-outline block mt-0.5';
      note.textContent = t.note;
      btn.appendChild(note);
    }
    btn.dataset.amount = t.amount;
    btn.dataset.index = String(i);
    btn.addEventListener('click', e => {
      if (customInput) customInput.value = '';
      window.selectTier(e, t.amount);
    });
    wrap.appendChild(btn);
  });
  wrap.className = 'grid gap-3.5 ' + (tiers.length <= 2 ? 'grid-cols-2' : tiers.length === 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4');

  const idx = Number.isInteger(d.defaultTierIndex) ? d.defaultTierIndex : 0;
  const defaultBtn = Array.from(wrap.children).find(b => b.dataset.index === String(idx)) || wrap.children[0];
  if (defaultBtn) {
    defaultBtn.classList.add('active');
    applyPledge(defaultBtn.dataset.amount);
  } else {
    applyPledge('');
  }

  if (custom) custom.classList.toggle('hidden', !d.allowCustomAmount);
  if (customInput) {
    if (d.customAmountPlaceholder) customInput.placeholder = d.customAmountPlaceholder;
    customInput.addEventListener('input', () => {
      const v = customInput.value.trim();
      wrap.querySelectorAll('.tier-chip').forEach(b => b.classList.remove('active'));
      if (v) {
        applyPledge(v);
      } else if (defaultBtn) {
        defaultBtn.classList.add('active');
        applyPledge(defaultBtn.dataset.amount);
      } else {
        applyPledge('');
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────
// PLANTS & MAP SECTION (Multi-location support)
// ─────────────────────────────────────────────────────────────
let activePlantIndex = 0;

function initPlantsSection() {
  const container = document.getElementById('plant-tabs');
  const plantsData = window.SITE_DATA?.plants?.locations;

  if (!plantsData || !plantsData.length) return;

  // Render tabs if more than 1 location exists
  if (container) {
    if (plantsData.length > 1) {
      container.innerHTML = plantsData.map((loc, idx) => `
        <button type="button" class="plant-tab-btn ${idx === activePlantIndex ? 'active' : ''}" onclick="switchPlant(${idx})">
          <span class="material-symbols-outlined text-sm align-middle mr-1">location_on</span>
          ${loc.name}
        </button>
      `).join('');
    } else {
      container.innerHTML = '';
    }
  }

  updateActivePlantUI(plantsData[activePlantIndex]);
}

window.switchPlant = function(idx) {
  const plantsData = window.SITE_DATA?.plants?.locations;
  if (!plantsData || !plantsData[idx]) return;
  activePlantIndex = idx;

  document.querySelectorAll('.plant-tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });

  updateActivePlantUI(plantsData[idx]);
};

function updateActivePlantUI(plant) {
  if (!plant) return;
  const iframe = document.getElementById('location-map');
  const nameEl = document.getElementById('plant-name-display');
  const statusEl = document.getElementById('plant-status-display');
  const peopleEl = document.getElementById('plant-people-display');
  const processEl = document.getElementById('plant-process-display');
  const pricingEl = document.getElementById('plant-pricing-display');
  const gmapsLink = document.getElementById('google-maps-link');

  if (iframe && plant.osmEmbedUrl) {
    iframe.src = plant.osmEmbedUrl;
  }
  if (nameEl) nameEl.textContent = plant.region || plant.name;
  if (statusEl && plant.status) statusEl.textContent = plant.status;
  if (peopleEl && plant.peopleServed) peopleEl.textContent = plant.peopleServed;
  if (processEl && plant.process) processEl.textContent = plant.process;
  if (pricingEl && plant.pricing) pricingEl.textContent = plant.pricing;
  if (gmapsLink && plant.googleMapsUrl) gmapsLink.href = plant.googleMapsUrl;
}

// Snap back button
window.snapToPlant = function() {
  const plantsData = window.SITE_DATA?.plants?.locations;
  const currentPlant = plantsData ? plantsData[activePlantIndex] : null;
  const defaultSrc = 'https://www.openstreetmap.org/export/embed.html?bbox=69.4800%2C28.3800%2C69.6200%2C28.4700&layer=mapnik&marker=28.4200%2C69.5600';
  const targetSrc = currentPlant?.osmEmbedUrl || defaultSrc;

  const iframe = document.getElementById('location-map');
  const btn = document.getElementById('snap-to-plant');
  if (!iframe) return;

  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined text-base">sync</span><span>Snapping…</span>';
    btn.disabled = true;
  }

  iframe.src = 'about:blank';
  setTimeout(() => {
    iframe.src = targetSrc;
    if (btn) {
      setTimeout(() => {
        btn.innerHTML = '<span class="material-symbols-outlined text-base">my_location</span><span>Snap back to plant location</span>';
        btn.disabled = false;
      }, 700);
    }
  }, 60);
};

// ─────────────────────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────────────────────
function initNavbar() {
  const header = document.getElementById('main-header');
  if (!header) return;
  function updateHeader() {
    header.classList.toggle('scrolled', window.scrollY > 50);
  }
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
}

// ─────────────────────────────────────────────────────────────
// HERO CAROUSEL
// ─────────────────────────────────────────────────────────────
let carouselCurrentSlide = 0;
let carouselAutoplayInterval;

function initCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  const bars = document.querySelectorAll('.carousel-bar');
  const counter = document.getElementById('slide-counter');
  const totalSlides = slides.length;
  if (!totalSlides) return;

  function showSlide(index) {
    if (index >= totalSlides) index = 0;
    if (index < 0) index = totalSlides - 1;
    carouselCurrentSlide = index;

    slides.forEach((slide, idx) => slide.classList.toggle('active', idx === carouselCurrentSlide));
    bars.forEach((bar, idx) => bar.classList.toggle('active', idx === carouselCurrentSlide));

    if (counter) {
      const pad = n => String(n).padStart(2, '0');
      counter.innerText = `${pad(carouselCurrentSlide + 1)} / ${pad(totalSlides)}`;
    }
  }

  window.goToSlide = function(index) { showSlide(index); resetAutoplay(); };
  window.nextSlide = function() { showSlide(carouselCurrentSlide + 1); resetAutoplay(); };
  window.prevSlide = function() { showSlide(carouselCurrentSlide - 1); resetAutoplay(); };

  function startAutoplay() { carouselAutoplayInterval = setInterval(() => showSlide(carouselCurrentSlide + 1), 5500); }
  function resetAutoplay() { clearInterval(carouselAutoplayInterval); startAutoplay(); }

  showSlide(0);
  startAutoplay();

  const container = document.querySelector('.carousel-container');
  if (container) {
    container.addEventListener('mouseenter', () => clearInterval(carouselAutoplayInterval));
    container.addEventListener('mouseleave', startAutoplay);
  }
}

// ─────────────────────────────────────────────────────────────
// SCROLL REVEALS
// ─────────────────────────────────────────────────────────────
function initScrollReveal() {
  const revealEls = document.querySelectorAll('.reveal-left, .reveal-right, .reveal-bottom');
  if (!revealEls.length) return;

  revealEls.forEach(el => {
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c =>
        c.classList.contains('reveal-left') || c.classList.contains('reveal-right') || c.classList.contains('reveal-bottom')
      );
      const idx = siblings.indexOf(el);
      if (idx > 0) el.style.transitionDelay = `${idx * 0.12}s`;
    }
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  revealEls.forEach(el => observer.observe(el));
}

// ─────────────────────────────────────────────────────────────
// DONATION TIER SELECTION
// ─────────────────────────────────────────────────────────────
function initDonationTiers() {
  // Used by both the built-in fallback buttons (inline onclick) and the db.json-driven ones
  window.selectTier = function(e, amount) {
    document.querySelectorAll('.tier-chip').forEach(btn => btn.classList.remove('active'));
    const clicked = e && e.currentTarget;
    if (clicked && clicked.classList) clicked.classList.add('active');
    applyPledge(amount);
  };
}

// ─────────────────────────────────────────────────────────────
// CONTACT FORM
// ─────────────────────────────────────────────────────────────
function initContactForm() {
  const contactForm = document.getElementById('inquiry-form');
  if (contactForm) {
    contactForm.addEventListener('submit', () => {
      const submitBtn = contactForm.querySelector('[type="submit"]');
      if (submitBtn) { submitBtn.textContent = 'Sending…'; submitBtn.disabled = true; }
    });
  }
}

// ─────────────────────────────────────────────────────────────
// MOBILE NAVIGATION
// ─────────────────────────────────────────────────────────────
function initMobileNav() {
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const closeNavBtn = document.getElementById('close-nav-btn');
  const mobileNav = document.getElementById('mobile-nav');
  const mobileBackdrop = document.getElementById('mobile-nav-backdrop');

  function openMobileNav() {
    if (mobileNav) mobileNav.classList.add('open');
    if (mobileBackdrop) mobileBackdrop.classList.add('open');
    if (hamburgerBtn) {
      hamburgerBtn.classList.add('nav-open');
      hamburgerBtn.setAttribute('aria-expanded', 'true');
    }
    document.body.style.overflow = 'hidden';
    setTimeout(() => { if (closeNavBtn) closeNavBtn.focus(); }, 300);
  }

  function closeMobileNav() {
    if (mobileNav) mobileNav.classList.remove('open');
    if (mobileBackdrop) mobileBackdrop.classList.remove('open');
    if (hamburgerBtn) {
      hamburgerBtn.classList.remove('nav-open');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
    }
    document.body.style.overflow = '';
  }

  if (hamburgerBtn) hamburgerBtn.addEventListener('click', openMobileNav);
  if (closeNavBtn) closeNavBtn.addEventListener('click', closeMobileNav);
  if (mobileBackdrop) mobileBackdrop.addEventListener('click', closeMobileNav);
  if (mobileNav) {
    mobileNav.querySelectorAll('.mobile-nav-link').forEach(link => {
      link.addEventListener('click', closeMobileNav);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileNav();
  });
}

// ─────────────────────────────────────────────────────────────
// PROGRESSIVE TIMELINE
// ─────────────────────────────────────────────────────────────
function initTimeline() {
  const timelineEl = document.getElementById('we-timeline');
  const timelineFill = document.getElementById('we-timeline-rail-fill');
  const timelineItems = timelineEl ? Array.from(timelineEl.querySelectorAll('.we-timeline-item')) : [];

  if (timelineItems.length && 'IntersectionObserver' in window) {
    const tlObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          tlObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -25% 0px' });
    timelineItems.forEach(item => tlObserver.observe(item));
  } else {
    timelineItems.forEach(item => item.classList.add('revealed'));
  }

  if (timelineEl && timelineFill) {
    let rafId = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function updateRail() {
      rafId = null;
      const rect = timelineEl.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const start = rect.top - vh * 0.5;
      const end = rect.bottom - vh * 0.5;
      let progress = (0 - start) / (end - start);
      progress = Math.max(0, Math.min(1, progress));
      if (reduceMotion) progress = (rect.top < vh && rect.bottom > 0) ? 1 : 0;
      timelineFill.style.height = (progress * 100).toFixed(2) + '%';
    }

    function scheduleUpdate() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(updateRail);
    }

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    updateRail();
    setTimeout(updateRail, 300);
  }
}