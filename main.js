// ─── Navbar scroll ───
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

// ─── Mobile menu ───
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const closeMenu = document.getElementById('closeMenu');
hamburger.addEventListener('click', () => mobileMenu.classList.add('open'));
closeMenu.addEventListener('click', () => mobileMenu.classList.remove('open'));
mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileMenu.classList.remove('open')));

// ─── Scroll reveal ───
const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach(el => {
  el.style.opacity = '0'; el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
  observer.observe(el);
});

// ─── Open/Closed badge ───
function getStoreStatus() {
  const now = new Date(); const day = now.getDay();
  const total = now.getHours() * 60 + now.getMinutes();
  const open = 450, close = 1320, friBreak = 720, friReopen = 930;
  let isOpen = day === 5
    ? (total >= open && total < friBreak) || (total >= friReopen && total < close)
    : total >= open && total < close;
  const badge = document.getElementById('storeBadge');
  if (badge) {
    badge.textContent = isOpen ? '🟢 Open Now' : '🔴 Closed Now';
    badge.style.background = isOpen ? 'var(--green-light)' : '#ffeaea';
    badge.style.color = isOpen ? 'var(--green)' : '#c00';
  }
}
getStoreStatus();

// ─── Promo Banner (Popup Poster) ───
async function checkPromoBanner() {
  const modal = document.getElementById('promoBannerModal');
  if (!modal) return;
  
  if (sessionStorage.getItem('promo_banner_closed') === 'true') return;
  
  try {
    const res = await fetch('/api/promo-banner');
    if (!res.ok) return;
    const data = await res.json();
    
    if (data.active && data.filename) {
      const img = document.getElementById('promoImage');
      const pdf = document.getElementById('promoPdf');
      
      if (data.type === 'image') {
        img.src = `images/${data.filename}`;
        img.style.display = 'block';
        pdf.style.display = 'none';
      } else if (data.type === 'pdf') {
        pdf.src = `images/${data.filename}`;
        pdf.style.display = 'block';
        img.style.display = 'none';
      }
      
      setTimeout(() => {
        modal.classList.add('open');
      }, 800);
    }
  } catch (err) {
    console.error("Promo banner check failed:", err);
  }
}

function closePromoBanner() {
  const modal = document.getElementById('promoBannerModal');
  if (modal) {
    modal.classList.remove('open');
    sessionStorage.setItem('promo_banner_closed', 'true');
  }
}

checkPromoBanner();

// ─── Flash Deal countdown ───
(function () {
  const banner = document.getElementById('flashBanner');
  const closeBtn = document.getElementById('flashClose');
  if (!banner) return;
  // Dismiss button
  closeBtn && closeBtn.addEventListener('click', () => banner.classList.add('hidden'));
  // Countdown to midnight
  function updateCountdown() {
    const now = new Date();
    const midnight = new Date(); midnight.setHours(23, 59, 59, 0);
    const diff = midnight - now;
    if (diff <= 0) { banner.classList.add('hidden'); return; }
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    const cdH = document.getElementById('cdH'); const cdM = document.getElementById('cdM'); const cdS = document.getElementById('cdS');
    if (cdH) cdH.textContent = h; if (cdM) cdM.textContent = m; if (cdS) cdS.textContent = s;
  }
  updateCountdown(); setInterval(updateCountdown, 1000);
})();

// ─── Smart Order ───
let selectedItems = {};
let allProducts = [];   // cache for impulse-upsell lookup (populated after search)
let aisleCountsCache = {}; // total products per aisle (from default view)

async function loadProducts() {
  try {
    // Default view: first 8 products per category
    const res = await fetch('/api/products?default=true');
    const data = await res.json();
    allProducts = data.products;
    aisleCountsCache = data.aisle_counts || {};
    renderProducts(data.products, '', data.aisle_counts);
  } catch (e) {
    console.error("Failed to load products", e);
    const c = document.getElementById('dynamicProductsList');
    if(c) c.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Failed to load products. Please refresh.</div>';
  }
}

// ─── Server-Side Search ───
let _searchTimer = null;

async function doSearch(query) {
  const q = query.trim();
  const container = document.getElementById('dynamicProductsList');
  if (!container) return;

  if (q.length === 0) {
    return loadProducts();
  }

  container.innerHTML = '<div style="text-align:center;padding:30px;color:#6b7280;">Searching…</div>';
  try {
    const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=60`);
    const data = await res.json();
    allProducts = [...allProducts, ...data.products].filter(
      (p, i, arr) => arr.findIndex(x => x.id === p.id) === i
    );
    renderProducts(data.products, q, {});
  } catch(e) {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:red;">Search failed. Please try again.</div>';
  }
}

function renderProducts(products, searchQuery = '', aisleCountsArg = {}) {
  const container = document.getElementById('dynamicProductsList');
  if(!container) return;
  container.innerHTML = '';

  const aisleHints = Object.keys(aisleCountsArg).length > 0 ? aisleCountsArg : aisleCountsCache;
  const isDefaultView = !searchQuery;

  const visibleProds = isDefaultView
    ? products.filter(p => p.stock_status !== 'out_of_stock')
    : products;

  if (visibleProds.length === 0) {
    container.innerHTML = `<div style="padding:40px 20px; text-align:center; color:#6b7280;">No products found matching "${searchQuery}" 😔</div>`;
    return;
  }
  
  const aisles = {};
  visibleProds.forEach(p => {
    if(!aisles[p.aisle]) aisles[p.aisle] = [];
    aisles[p.aisle].push(p);
  });
  
  const aisleIcons = {
    "Dairy & Ice Cream": "🥛🍧",
    "Tea, Coffee & Biscuits": "☕🍪",
    "Snacks, Drinks & Chocolates": "🥤🍫",
    "Cooking & Masalas": "🥘🌶️",
    "Personal & Baby Care": "🧴👶",
    "Household & Stationery": "🧹✏️"
  };
  
  for(const [aisle, prods] of Object.entries(aisles)) {
    const icon = aisleIcons[aisle] || "🛍️";
    const catDiv = document.createElement('div');
    catDiv.className = 'order-category';
    
    const header = document.createElement('div');
    header.className = 'order-cat-header';
    header.innerText = `${icon} ${aisle}`;
    catDiv.appendChild(header);
    
    const grid = document.createElement('div');
    grid.className = 'order-items-grid';
    
    prods.forEach(p => {
      const isOut = p.stock_status === 'out_of_stock';
      const itemDiv = document.createElement('div');
      itemDiv.className = 'order-item';
      if(isOut) itemDiv.style.opacity = '0.5';
      
      const isChecked = !!selectedItems[`p_${p.id}`];
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `p_${p.id}`;
      cb.dataset.name = p.name;
      cb.disabled = isOut;
      cb.checked = isChecked;
      
      const label = document.createElement('label');
      label.htmlFor = cb.id;
      if(isOut) {
        label.innerHTML = `<span style="text-decoration:line-through">${p.name}</span> <span style="color:#ef4444;font-size:12px;display:block;">(Out of Stock)</span>`;
      } else {
        const hasDiscount = p.mrp && p.mrp > p.price;
        const mrpHtml = hasDiscount 
          ? `<span style="text-decoration:line-through;color:#ef4444;font-size:11px;margin-right:6px;">₹${p.mrp.toFixed(2)}</span>` 
          : '';
        label.innerHTML = `
          ${p.name} 
          <span style="font-size:13px;display:block;margin-top:2px;">
            ${mrpHtml}<span style="color:#1a7a4c;font-weight:bold;">₹${p.price.toFixed(2)}</span>
          </span>`;
      }
      
      const qtyVal = isChecked ? selectedItems[`p_${p.id}`].qty : 1;
      const qty = document.createElement('input');
      qty.type = 'number';
      qty.className = 'order-qty';
      qty.value = qtyVal;
      qty.min = 1;
      qty.max = 20;
      qty.dataset.id = cb.id;
      qty.disabled = isOut;
      
      itemDiv.appendChild(cb);
      itemDiv.appendChild(label);
      itemDiv.appendChild(qty);
      grid.appendChild(itemDiv);
      
      cb.addEventListener('change', () => {
        const qtyVal = parseInt(qty.value) || 1;
        if(cb.checked) {
          selectedItems[cb.id] = {id: p.id, name: p.name, price: p.price, qty: qtyVal};
        } else {
          delete selectedItems[cb.id];
        }
        updateOrderSummary();
      });
      
      qty.addEventListener('change', () => {
        if(selectedItems[cb.id]) {
          selectedItems[cb.id].qty = parseInt(qty.value) || 1;
          updateOrderSummary();
        }
      });
    });
    catDiv.appendChild(grid);

    if (isDefaultView && aisleHints[aisle] && aisleHints[aisle] > prods.length) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:12px;color:#6b7280;padding:6px 0 2px;text-align:center;';
      hint.innerHTML = `🔍 Search to see all <b>${aisleHints[aisle]}</b> products in ${aisle}`;
      catDiv.appendChild(hint);
    }

    container.appendChild(catDiv);
  }
}

function updateOrderSummary() {
  const list = document.getElementById('orderList');
  const empty = document.getElementById('orderEmpty');
  const countBadge = document.getElementById('orderCount');
  if (!list) return;
  const items = Object.values(selectedItems);
  countBadge.textContent = items.length;
  
  if (items.length === 0) {
    if (empty) empty.style.display = 'block';
    list.querySelectorAll('.order-list-item, .order-total-row').forEach(i => i.remove());
  } else {
    if (empty) empty.style.display = 'none';
    list.querySelectorAll('.order-list-item, .order-total-row').forEach(i => i.remove());
    let total = 0;
    items.forEach(item => {
      total += (item.qty * item.price);
      const div = document.createElement('div');
      div.className = 'order-list-item';
      div.innerHTML = `<span class="item-name">${item.name}</span> <span style="color:#6b7280;font-size:13px">₹${item.price} x ${item.qty}</span> <span class="item-qty">₹${(item.qty * item.price).toFixed(2)}</span>`;
      list.appendChild(div);
    });
    const totDiv = document.createElement('div');
    totDiv.className = 'order-total-row';
    totDiv.style = "margin-top:10px; padding-top:10px; border-top:1px solid #e5e7eb; display:flex; justify-content:space-between; font-weight:700;";
    totDiv.innerHTML = `<span>Estimated Total:</span> <span>₹${total.toFixed(2)}</span>`;
    list.appendChild(totDiv);
  }
}

function openCheckoutModal(e) {
  if (e) e.preventDefault();
  const items = Object.values(selectedItems);
  if (items.length === 0) { alert('Please select at least one item!'); return; }
  const address = document.getElementById('orderAddress').value.trim();
  const phone   = document.getElementById('orderPhone').value.trim();
  if (!phone)   { alert('Please enter your phone number before sending.'); document.getElementById('orderPhone').focus(); return; }
  if (!address) { alert('Please enter your delivery address before sending.'); document.getElementById('orderAddress').focus(); return; }
  
  renderCheckoutBill();
  renderImpulseUpsells();
  document.getElementById('checkoutModal').classList.add('active');
}

function closeCheckoutModal() {
  document.getElementById('checkoutModal').classList.remove('active');
}

function renderCheckoutBill() {
  const list = document.getElementById('cmBillList');
  const totalDiv = document.getElementById('cmBillTotal');
  if(!list) return;
  
  list.innerHTML = '';
  let total = 0;
  const items = Object.values(selectedItems);
  items.forEach(item => {
    total += (item.qty * item.price);
    const row = document.createElement('div');
    row.style = `display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f3f4f6; font-size:0.9rem;`;
    row.innerHTML = `<span>${item.name} <small style="color:#6b7280">x${item.qty}</small></span> <span style="font-weight:600">₹${(item.qty * item.price).toFixed(2)}</span>`;
    list.appendChild(row);
  });
  totalDiv.innerHTML = `<h3 style="margin:16px 0 0; text-align:right; font-size:1.15rem; color:var(--green)">Grand Total: ₹${total.toFixed(2)}</h3>`;
}

function renderImpulseUpsells() {
  const grid = document.getElementById('cmImpulseGrid');
  if(!grid) return;
  grid.innerHTML = '';
  
  const impulseProds = allProducts.filter(p => p.aisle && p.aisle.toLowerCase().includes('impulse'));
  if (impulseProds.length === 0) {
    grid.innerHTML = '<span style="color:#6b7280; font-size:0.9rem;">No extra treats available right now.</span>';
    return;
  }
  
  impulseProds.forEach(p => {
    const isOut = p.stock_status === 'out_of_stock';
    const isChecked = !!selectedItems[`p_${p.id}`];
    
    const card = document.createElement('label');
    card.className = 'cm-impulse-item';
    if(isOut) card.style.opacity = '0.5';
    
    const safeName = p.name.toLowerCase().replace(/\s+/g, '_');
    const hasDiscount = p.mrp && p.mrp > p.price;
    const mrpHtml = hasDiscount 
      ? `<span style="text-decoration:line-through;color:#ef4444;font-size:10px;margin-right:4px;">₹${p.mrp.toFixed(2)}</span>` 
      : '';
    card.innerHTML = `
      <img src="images/${safeName}.png" onerror="this.src='images/placeholder.svg'" alt="${p.name}">
      <div class="cm-im-info">
        <span class="cm-im-name">${p.name}</span>
        <span class="cm-im-price">${mrpHtml}<span style="color:#1a7a4c;font-weight:bold;">₹${p.price.toFixed(2)}</span></span>
      </div>
      <div class="cm-cb-wrapper">
        <input type="checkbox" class="cm-cb" value="${p.id}" ${isChecked ? 'checked' : ''} ${isOut ? 'disabled' : ''}>
      </div>
    `;
    
    const cb = card.querySelector('.cm-cb');
    cb.addEventListener('change', () => {
      const pid = `p_${p.id}`;
      const mainCb = document.getElementById(pid);
      if (mainCb) mainCb.checked = cb.checked;
      
      if (cb.checked) {
        selectedItems[pid] = {id: pid, name: p.name, price: p.price, qty: 1};
        const mainQty = document.querySelector(`.order-qty[data-id="${pid}"]`);
        if (mainQty) mainQty.value = 1;
      } else {
        delete selectedItems[pid];
      }
      
      updateOrderSummary();
      renderCheckoutBill();
    });
    
    grid.appendChild(card);
  });
}

async function confirmWhatsAppOrder(e) {
  e.preventDefault();
  const items = Object.values(selectedItems);
  if (items.length === 0) { alert('Please select at least one item!'); return; }
  const note    = document.getElementById('orderNote').value.trim();
  const address = document.getElementById('orderAddress').value.trim();
  const phone   = document.getElementById('orderPhone').value.trim();
  if (!phone)   { alert('Please enter your phone number before sending.'); return; }
  if (!address) { alert('Please enter your delivery address before sending.'); return; }

  const btn = document.getElementById('cmConfirmBtn');
  btn.innerText = "Processing...";
  btn.style.pointerEvents = "none";

  let total = 0;
  let msg = 'ORDER:\n';
  items.forEach(i => { 
    total += (i.qty * i.price);
    msg += `• ${i.name} x${i.qty} (₹${i.price * i.qty})\n`; 
  });
  msg += `\nEstimated Total: ₹${total.toFixed(2)}`;
  msg += `\n\n📞 Phone: ${phone}`;
  msg += `\n📍 Address: ${address}`;
  if (note) msg += `\n📝 Note: ${note}`;

  try {
    await fetch('/api/orders/new', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        phone:   phone,
        name:    "Website User",
        address: address,
        items:   items,
        total:   total
      })
    });
  } catch(err) {
    console.error("Could not save to DB", err);
  }

  btn.innerHTML = `Send Order on WhatsApp`;
  btn.style.pointerEvents = "auto";
  closeCheckoutModal();

  saveAddressHistory(address);
  localStorage.setItem('shopwel_last_order', JSON.stringify(items));
  window.open(`https://wa.me/917353003409?text=${encodeURIComponent(msg)}`, '_blank');
}

function saveAddressHistory(address) {
  if (!address) return;
  let history = JSON.parse(localStorage.getItem('shopwel_address_history') || '[]');
  history = history.filter(a => a !== address);
  history.unshift(address);
  if (history.length > 5) history.pop();
  localStorage.setItem('shopwel_address_history', JSON.stringify(history));
}

function clearOrder() {
  selectedItems = {};
  document.querySelectorAll('#orderPanel input[type=checkbox]').forEach(cb => cb.checked = false);
  updateOrderSummary();
}

// ─── Restore saved address & phone ───
(function () {
  // Restore phone number
  const savedPhone = localStorage.getItem('shopwel_phone');
  const phoneInput = document.getElementById('orderPhone');
  if (savedPhone && phoneInput) phoneInput.value = savedPhone;

  // Restore address
  const savedAddr = localStorage.getItem('shopwel_address');
  const addrInput = document.getElementById('orderAddress');
  if (savedAddr && addrInput) addrInput.value = savedAddr;

  // Restore address history into datalist
  const history = JSON.parse(localStorage.getItem('shopwel_address_history') || '[]');
  const datalist = document.getElementById('savedAddresses');
  if (datalist && history.length > 0) {
    history.forEach(addr => {
      const option = document.createElement('option');
      option.value = addr;
      datalist.appendChild(option);
    });
  }
})();

// ─── Recipe ───
function recipeSelectAll() {
  document.querySelectorAll('.ingredient-item input[type=checkbox]').forEach(cb => { cb.checked = true; });
}

function sendRecipeToWhatsApp(e) {
  e.preventDefault();
  const selected = [];
  document.querySelectorAll('.ingredient-item input[type=checkbox]:checked').forEach(cb => {
    const name = cb.getAttribute('data-name');
    const qty = cb.closest('.ingredient-item').querySelector('.qty').textContent;
    selected.push(`• ${name} (${qty})`);
  });
  if (!selected.length) { alert('Please select at least one ingredient!'); return; }
  const msg = `ORDER:\nPaneer Butter Masala – Ingredients\n\n${selected.join('\n')}`;
  window.open(`https://wa.me/917353003409?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── Cart Summary Click ───
function handleCartSummaryClick(headerEl) {
  const items = Object.keys(selectedItems);
  if (items.length === 0) {
    const orderPanel = document.getElementById('orderPanel');
    if (orderPanel) {
      const y = orderPanel.getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
    headerEl.parentElement.classList.remove('expanded');
  } else {
    headerEl.parentElement.classList.toggle('expanded');
  }
}

// Initialize dynamic products load
loadProducts();

// Search Bar Listener with 300ms debounce
const orderSearch = document.getElementById('orderSearch');
if (orderSearch) {
  orderSearch.addEventListener('input', (e) => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => doSearch(e.target.value), 300);
  });
}
