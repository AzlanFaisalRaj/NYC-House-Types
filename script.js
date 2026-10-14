// ---------- CONFIG ----------
const API_BASE_URL = "https://nyc-airbnb-room-type-predictor.onrender.com";
const PREDICT_URL = `${API_BASE_URL}/predict`;
const HEALTH_URL = `${API_BASE_URL}/`;
const $ = (id) => document.getElementById(id);

// Order matches sklearn's alphabetical classes_ (same order as the model's Probability array)
const CLASSES = [
  { key: "Entire home/apt", label: "Entire home", color: "#FF6319",
    icon: '<path d="M4 20V10l8-6 8 6v10z"/><path d="M10 20v-6h4v6"/>' },
  { key: "Private room", label: "Private room", color: "#00A651",
    icon: '<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="15" cy="12" r=".8"/>' },
  { key: "Shared room", label: "Shared room", color: "#B24FD6",
    icon: '<path d="M4 20V5M20 20v-7H4M4 13h16M7 10h4"/>' },
];

const HOODS = {
  "Manhattan": ["Harlem", "Midtown", "Upper West Side", "Upper East Side", "East Village", "Hell's Kitchen", "Chelsea", "Washington Heights", "Lower East Side"],
  "Brooklyn": ["Williamsburg", "Bedford-Stuyvesant", "Bushwick", "Crown Heights", "Greenpoint", "Park Slope", "Flatbush"],
  "Queens": ["Astoria", "Long Island City", "Flushing", "Jamaica", "Ridgewood", "Sunnyside"],
  "Bronx": ["Mott Haven", "Kingsbridge", "Concourse", "Fordham"],
  "Staten Island": ["St. George", "Tompkinsville", "Great Kills"],
};
const CENTERS = {
  "Manhattan": [40.7831, -73.9712], "Brooklyn": [40.6782, -73.9442], "Queens": [40.7282, -73.7949],
  "Bronx": [40.8448, -73.8648], "Staten Island": [40.5795, -74.1502],
};
const EXAMPLES = [
  { latitude: 40.7484, longitude: -73.9857, price: 220, minimum_nights: 2, number_of_reviews: 84, reviews_per_month: 2.3,
    calculated_host_listings_count: 1, availability_365: 210, neighbourhood_group: "Manhattan", neighbourhood: "Midtown" },
  { latitude: 40.6872, longitude: -73.9418, price: 55, minimum_nights: 1, number_of_reviews: 210, reviews_per_month: 4.1,
    calculated_host_listings_count: 3, availability_365: 300, neighbourhood_group: "Brooklyn", neighbourhood: "Bedford-Stuyvesant" },
  { latitude: 40.7282, longitude: -73.7949, price: 38, minimum_nights: 3, number_of_reviews: 12, reviews_per_month: 0.6,
    calculated_host_listings_count: 1, availability_365: 90, neighbourhood_group: "Queens", neighbourhood: "Flushing" },
];
let exIdx = 0;

const form = $("predictForm");

// ---------- form helpers ----------
function fillHoods(borough) {
  $("hoods").innerHTML = (HOODS[borough] || []).map((h) => `<option value="${h}">`).join("");
}
form.querySelectorAll('input[name="neighbourhood_group"]').forEach((r) =>
  r.addEventListener("change", () => {
    fillHoods(r.value);
    const [la, lo] = CENTERS[r.value];
    if (!$("latitude").value) $("latitude").value = la;
    if (!$("longitude").value) $("longitude").value = lo;
  })
);
$("availability_365").addEventListener("input", (e) => ($("availabilityValue").textContent = e.target.value));

$("exampleBtn").addEventListener("click", () => {
  const d = EXAMPLES[exIdx++ % EXAMPLES.length];
  fillHoods(d.neighbourhood_group);
  Object.entries(d).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = v; });
  $("availabilityValue").textContent = d.availability_365;
  $("formError").textContent = "";
});

function payload() {
  const g = (n) => form.elements[n].value;
  return {
    latitude: parseFloat(g("latitude")), longitude: parseFloat(g("longitude")),
    price: parseFloat(g("price")), minimum_nights: parseInt(g("minimum_nights"), 10),
    number_of_reviews: parseInt(g("number_of_reviews"), 10), reviews_per_month: parseFloat(g("reviews_per_month")),
    calculated_host_listings_count: parseInt(g("calculated_host_listings_count"), 10),
    availability_365: parseInt(g("availability_365"), 10),
    neighbourhood_group: g("neighbourhood_group"), neighbourhood: g("neighbourhood").trim(),
  };
}

function setLoading(on) {
  $("predictBtn").disabled = on;
  $("predictBtn").classList.toggle("loading", on);
  $("btnLabel").textContent = on ? "Predicting" : "Predict room type";
}

// ---------- submit ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  $("formError").textContent = "";
  $("formNote").textContent = "";
  if (!form.elements.neighbourhood_group.value) {
    $("formError").textContent = "Choose a borough first.";
    return;
  }
  if (!form.reportValidity()) return;

  setLoading(true);
  const slow = setTimeout(() => {
    $("formNote").textContent = "The server was asleep and is starting up. The first prediction can take up to a minute.";
  }, 4000);
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 90000);

  try {
    const res = await fetch(PREDICT_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload()), signal: ctrl.signal,
    });
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      const d = b && b.detail;
      throw new Error(Array.isArray(d) ? d.map((x) => x.msg).join(". ") : d || `Request failed (${res.status}).`);
    }
    render(await res.json());
  } catch (err) {
    $("formError").textContent = err.name === "AbortError"
      ? "The server took too long to answer. Try again in a moment."
      : err instanceof TypeError
        ? "Can't reach the prediction server. Check that the API is running and the URL in script.js is correct."
        : err.message;
  } finally {
    clearTimeout(slow); clearTimeout(kill);
    $("formNote").textContent = "";
    setLoading(false);
  }
});

// ---------- render ----------
const CIRC = 527.8;
const ICON = (c) => `<svg viewBox="0 0 24 24" aria-hidden="true">${c.icon}</svg>`;

function render(result) {
  const probs = result.Probability || [];
  const items = CLASSES.map((c, i) => ({ ...c, p: typeof probs[i] === "number" ? probs[i] : 0 }));
  const top = items.find((c) => c.key === result.Predicted_room_type) || items.slice().sort((a, b) => b.p - a.p)[0];
  const second = items.filter((c) => c !== top).sort((a, b) => b.p - a.p)[0];
  const pct = (p) => Math.round(p * 100);

  $("resultEmpty").hidden = true;
  $("resultContent").hidden = false;

  $("gaugeWrap").style.setProperty("--c", top.color);
  $("gIcon").innerHTML = top.icon;
  $("gLabel").textContent = top.label;
  $("gFg").style.strokeDashoffset = CIRC;

  $("verdict").textContent = `Most likely a ${top.label.toLowerCase()}.`;
  const close = top.p - second.p < 0.2;
  $("verdictSub").textContent = top.p >= 0.75
    ? `The model is confident about this one.`
    : close
      ? `A close call: ${second.label.toLowerCase()} is at ${pct(second.p)}%. Treat this as a lean, not a certainty.`
      : `The model leans this way, but with some doubt.`;

  $("rows").innerHTML = items
    .slice().sort((a, b) => b.p - a.p)
    .map((c) => `<div class="r${c === top ? " top" : ""}" style="--c:${c.color}">
      <span class="ic">${ICON(c)}</span><span>${c.label}</span><b>${pct(c.p)}%</b>
      <div class="bar"><i data-w="${pct(c.p)}"></i></div></div>`).join("");

  requestAnimationFrame(() => setTimeout(() => {
    $("gFg").style.strokeDashoffset = CIRC * (1 - top.p);
    document.querySelectorAll(".bar i").forEach((el) => (el.style.width = el.dataset.w + "%"));
    count($("gPct"), pct(top.p));
  }, 60));
}

function count(el, to) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to + "%"; return; }
  const t0 = performance.now();
  (function tick(t) {
    const k = Math.min(1, (t - t0) / 1000);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))) + "%";
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}

// ---------- skyline ----------
function buildSkyline() {
  const W = 1600, H = 400, cols = ["#FF6319", "#FCCC0A", "#00B85C", "#B957DE", "#FFE9B8"];
  let x = -10, out = "";
  while (x < W) {
    const w = 38 + Math.floor(Math.random() * 54), bh = 70 + Math.floor(Math.random() * 270);
    out += `<rect x="${x}" y="${H - bh}" width="${w}" height="${bh}" fill="#12143A"/>`;
    if (Math.random() < 0.3) out += `<rect x="${x + w / 2 - 1}" y="${H - bh - 26}" width="2" height="26" fill="#12143A"/>`;
    for (let wy = H - bh + 10; wy < H - 8; wy += 14)
      for (let wx = x + 7; wx < x + w - 8; wx += 12)
        if (Math.random() < 0.22)
          out += `<rect x="${wx}" y="${wy}" width="4" height="6" fill="${cols[Math.floor(Math.random() * cols.length)]}" opacity=".85"${Math.random() < 0.2 ? ` class="tw" style="animation-delay:${(Math.random() * 6).toFixed(1)}s"` : ""}/>`;
    x += w + Math.floor(Math.random() * 6);
  }
  $("skyline").innerHTML = out;
}

// ---------- API status ----------
async function checkApi() {
  const s = $("apiStatus");
  s.className = "status wait";
  s.lastElementChild.textContent = "Waking the server";
  try {
    const r = await fetch(HEALTH_URL);
    if (!r.ok) throw 0;
    s.className = "status on";
    s.lastElementChild.textContent = "Server ready";
  } catch {
    s.className = "status off";
    s.lastElementChild.textContent = "Server unreachable";
  }
}
document.addEventListener("DOMContentLoaded", () => { buildSkyline(); checkApi(); });
