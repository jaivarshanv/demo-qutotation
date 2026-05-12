/* ------------------------------------------------------------------
 * 1. FIREBASE INIT & CONFIGURATION
 * ------------------------------------------------------------------ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// IMPORTANT: REPLACE WITH YOUR FIREBASE CONFIG
const firebaseConfig = {
    apiKey: "AIzaSyBOT-0d8sKzcq3OUliJ4LR7oQG2ylF9gQ4",
    authDomain: "steel-plant-demo.firebaseapp.com",
    projectId: "steel-plant-demo",
    storageBucket: "steel-plant-demo.firebasestorage.app",
    messagingSenderId: "216753648242",
    appId: "1:216753648242:web:ff00110b3fa6403f2b08eb",
    measurementId: "G-DKT2BJ7P40"
};
// IMPORTANT: Replace with the actual email you log in with to view the admin panel
const ADMIN_EMAIL = "jaivarshanv@gmail.com";

const EMAILJS_PUBLIC_KEY = "L03Pzrso6fJbpdziq";
const EMAILJS_SERVICE_ID = "steel_plant";
const EMAILJS_TEMPLATE_ID = "template_t3p2ttj";

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.warn("Firebase not properly configured.", e);
}

/* ------------------------------------------------------------------
 * 2. STATE MANAGEMENT
 * ------------------------------------------------------------------ */
let state = {
    user: null,
    quote: {
        category: '',
        material: '',
        distance: 0,
        calculatedVolume: 0,
        rawDimensionsString: '' // Saved for the PDF and Email printout
    },
    totals: { base: 0, labor: 0, logistics: 0, fees: 0, grand: 0 }
};

// Default fallbacks 
let globalVars = {
    rate_carbon: 0.85,
    rate_stainless: 2.15,
    rate_aluminum: 1.45,
    labor_cost: 150.00,
    logistics_per_mile: 2.50,
    tax_rate: 7.0,
    profit_margin: 20.0
};

const steps = [
    document.getElementById('step-1'), document.getElementById('step-2'),
    document.getElementById('step-3'), document.getElementById('step-4'),
    document.getElementById('step-5')
];

function showStep(index) {
    steps.forEach((el, i) => {
        if (i === index) {
            el.classList.remove('hidden-step');
            setTimeout(() => el.classList.add('fade-enter-active'), 10);
        } else {
            el.classList.remove('fade-enter-active');
            el.classList.add('hidden-step');
        }
    });
}

/* ------------------------------------------------------------------
 * 3. AUTHENTICATION (STEP 1)
 * ------------------------------------------------------------------ */
document.getElementById('btn-google-login').addEventListener('click', async () => {
    if (!auth) return alert("Firebase not configured.");
    const provider = new GoogleAuthProvider();
    try { await signInWithPopup(auth, provider); }
    catch (error) { console.error("Auth error", error); }
});

if (auth) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.user = user;
            document.getElementById('user-badge').classList.remove('hidden');
            document.getElementById('user-email-display').innerText = user.email;
            document.getElementById('input-final-email').value = user.email;
            showStep(1);
            setupFirestoreListener();
        } else {
            showStep(0);
        }
    });
} else {
    document.getElementById('btn-google-login').addEventListener('click', () => showStep(1));
}

/* ------------------------------------------------------------------
 * 4. CUSTOMER JOURNEY (STEPS 2-4)
 * ------------------------------------------------------------------ */
document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.getAttribute('data-category');
        state.quote.category = cat;

        document.querySelectorAll('.dynamic-form').forEach(f => f.classList.add('hidden'));
        document.querySelectorAll('.dynamic-form input').forEach(input => input.removeAttribute('required'));

        if (cat === 'Heavy Structural') {
            document.getElementById('form-heavy').classList.remove('hidden');
            document.querySelectorAll('#form-heavy input').forEach(i => i.setAttribute('required', 'true'));
        } else if (cat === 'Industrial & Sanitary') {
            document.getElementById('form-piping').classList.remove('hidden');
            document.querySelectorAll('#form-piping input').forEach(i => i.setAttribute('required', 'true'));
        } else if (cat === 'Residential') {
            document.getElementById('form-res').classList.remove('hidden');
            document.querySelectorAll('#form-res input').forEach(i => i.setAttribute('required', 'true'));
        } else if (cat === 'Agriculture') {
            document.getElementById('form-agri').classList.remove('hidden');
            document.querySelectorAll('#form-agri input').forEach(i => i.setAttribute('required', 'true'));
        }
        showStep(2);
    });
});

document.getElementById('requirements-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.quote.material = document.getElementById('input-material').value;

    let vol = 0;
    let dimsStr = "";

    if (state.quote.category === 'Heavy Structural') {
        const len = parseFloat(document.getElementById('hs-length').value);
        const depth = parseFloat(document.getElementById('hs-depth').value);
        const flange = parseFloat(document.getElementById('hs-flange').value);
        const thick = parseFloat(document.getElementById('hs-thick').value);
        vol = ((depth * thick) + (2 * flange * thick)) * (len * 12);
        dimsStr = `${len}ft L x ${depth}" D x ${flange}" F (Thick: ${thick}")`;
    } else if (state.quote.category === 'Industrial & Sanitary') {
        const len = parseFloat(document.getElementById('pipe-length').value);
        const od = parseFloat(document.getElementById('pipe-od').value);
        const wall = parseFloat(document.getElementById('pipe-wall').value);
        const id = od - (2 * wall);
        vol = Math.PI * (Math.pow(od / 2, 2) - Math.pow(id / 2, 2)) * (len * 12);
        dimsStr = `${len}ft Run x ${od}" OD (Wall: ${wall}")`;
    } else if (state.quote.category === 'Residential') {
        const area = parseFloat(document.getElementById('res-area').value);
        const gauge = parseFloat(document.getElementById('res-gauge').value);
        vol = (area * 144) * gauge;
        dimsStr = `${area} sq ft @ ${gauge}" Thick`;
    } else if (state.quote.category === 'Agriculture') {
        const len = parseFloat(document.getElementById('agri-length').value);
        const height = parseFloat(document.getElementById('agri-height').value);
        const spacing = parseFloat(document.getElementById('agri-spacing').value);
        vol = (len * height * 144) * 0.05;
        dimsStr = `${len}ft Run x ${height}ft Height (Posts: ${spacing}ft)`;
    }

    state.quote.calculatedVolume = vol;
    state.quote.rawDimensionsString = dimsStr;
    showStep(3);
});

// Geolocation
const PLANT_LAT = 34.7203; const PLANT_LNG = -80.7709;
function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; const dLat = (lat2 - lat1) * (Math.PI / 180); const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

document.getElementById('btn-geolocate').addEventListener('click', () => {
    const btn = document.getElementById('btn-geolocate');
    btn.innerHTML = '<span class="animate-pulse font-mono">CALCULATING SATELLITE FIX...</span>';

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                state.quote.distance = Math.round(getHaversineDistance(PLANT_LAT, PLANT_LNG, position.coords.latitude, position.coords.longitude));
                document.getElementById('btn-geolocate').classList.add('hidden');
                document.getElementById('distance-output').classList.remove('hidden');
                document.getElementById('calc-miles').innerText = state.quote.distance;
                document.getElementById('btn-step4-next').classList.remove('hidden');
            },
            (error) => {
                alert("Geolocation failed. Defaulting to 150 miles.");
                state.quote.distance = 150;
                document.getElementById('btn-step4-next').classList.remove('hidden');
                btn.innerText = "LOCATION DENIED (150mi applied)";
            }
        );
    }
});

document.getElementById('btn-step4-next').addEventListener('click', () => {
    updateQuoteCalculation();
    showStep(4);
});

/* ------------------------------------------------------------------
 * 5. LIVE CALCULATION & FIRESTORE SYNC
 * ------------------------------------------------------------------ */
function setupFirestoreListener() {
    if (!db) return;
    const docRef = doc(db, "settings", "global_vars");

    onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            globalVars = docSnap.data();

            // Pre-fill Admin
            document.getElementById('admin-rate-carbon').value = globalVars.rate_carbon || 0.85;
            document.getElementById('admin-rate-stainless').value = globalVars.rate_stainless || 2.15;
            document.getElementById('admin-rate-aluminum').value = globalVars.rate_aluminum || 1.45;
            document.getElementById('admin-labor').value = globalVars.labor_cost;
            document.getElementById('admin-logistics').value = globalVars.logistics_per_mile;
            document.getElementById('admin-tax').value = globalVars.tax_rate;
            document.getElementById('admin-margin').value = globalVars.profit_margin;

            if (!document.getElementById('step-5').classList.contains('hidden-step')) {
                updateQuoteCalculation();
            }
        }
    });
}

function updateQuoteCalculation() {
    const volume = state.quote.calculatedVolume;

    let activeRate = 0;
    if (state.quote.material === "A36_Carbon") activeRate = globalVars.rate_carbon;
    else if (state.quote.material === "304_Stainless") activeRate = globalVars.rate_stainless;
    else if (state.quote.material === "6061_Aluminum") activeRate = globalVars.rate_aluminum;

    const baseCost = volume * activeRate;
    const laborCost = parseFloat(globalVars.labor_cost);
    const logisticsCost = state.quote.distance * globalVars.logistics_per_mile;

    const subtotal = baseCost + laborCost + logisticsCost;
    const marginVal = subtotal * (globalVars.profit_margin / 100);
    const totalWithMargin = subtotal + marginVal;
    const taxVal = totalWithMargin * (globalVars.tax_rate / 100);

    const grandTotal = totalWithMargin + taxVal;

    state.totals = {
        base: baseCost, labor: laborCost, logistics: logisticsCost, fees: marginVal + taxVal, grand: grandTotal
    };

    document.getElementById('out-sector').innerText = state.quote.category;
    document.getElementById('out-volume').innerText = volume.toFixed(2);
    document.getElementById('out-material').innerText = state.quote.material.replace('_', ' ');
    document.getElementById('out-distance').innerText = state.quote.distance;

    document.getElementById('cost-base').innerText = `$${baseCost.toFixed(2)}`;
    document.getElementById('cost-labor').innerText = `$${laborCost.toFixed(2)}`;
    document.getElementById('cost-logistics').innerText = `$${logisticsCost.toFixed(2)}`;
    document.getElementById('cost-fees').innerText = `$${state.totals.fees.toFixed(2)}`;
    document.getElementById('cost-total').innerText = `$${grandTotal.toFixed(2)}`;
}

/* ------------------------------------------------------------------
 * 6. OUTPUT GENERATION
 * ------------------------------------------------------------------ */
document.getElementById('btn-finalize').addEventListener('click', async () => {
    const btn = document.getElementById('btn-finalize');
    btn.innerText = "GENERATING...";
    btn.disabled = true;

    // --- jsPDF ---
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();

    pdf.setFillColor(10, 10, 10);
    pdf.rect(0, 0, 210, 297, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("courier", "bold");
    pdf.setFontSize(24);
    pdf.text("SYS.QUOTE // MANIFEST", 20, 30);

    pdf.setTextColor(255, 0, 49);
    pdf.setFontSize(10);
    pdf.text(`TS: ${new Date().toISOString()}`, 20, 40);

    pdf.setDrawColor(50, 50, 50);
    pdf.line(20, 45, 190, 45);

    pdf.setTextColor(255, 255, 255);
    pdf.setFont("courier", "normal");
    pdf.setFontSize(12);
    pdf.text("PARAMETERS:", 20, 60);
    pdf.text(`SECTOR:   ${state.quote.category}`, 20, 70);
    pdf.text(`MATERIAL: ${state.quote.material.replace('_', ' ')}`, 20, 80);
    // Updated to use the custom dimensions string we generated in Step 3
    pdf.text(`DIMS:     ${state.quote.rawDimensionsString}`, 20, 90);
    pdf.text(`VOLUME:   ${state.quote.calculatedVolume.toFixed(2)} cu in`, 20, 100);
    pdf.text(`ROUTING:  ${state.quote.distance} MILES`, 20, 110);

    pdf.line(20, 120, 190, 120);

    pdf.text("FINANCIALS:", 20, 135);
    pdf.text(`BASE MTL: $${state.totals.base.toFixed(2)}`, 20, 145);
    pdf.text(`LABOR:    $${state.totals.labor.toFixed(2)}`, 20, 155);
    pdf.text(`LOGISTCS: $${state.totals.logistics.toFixed(2)}`, 20, 165);
    pdf.text(`FEES/TAX: $${state.totals.fees.toFixed(2)}`, 20, 175);

    pdf.setFont("courier", "bold");
    pdf.setTextColor(255, 0, 49);
    pdf.setFontSize(16);
    pdf.text(`AUTHORIZED TOTAL: $${state.totals.grand.toFixed(2)}`, 20, 195);

    pdf.save(`SYS_QUOTE_${Date.now()}.pdf`);

    // --- EmailJS ---
    if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        const templateParams = {
            to_email: document.getElementById('input-final-email').value,
            quote_id: `QTE-${Date.now().toString().slice(-6)}`,
            category: state.quote.category.toUpperCase(),
            material: state.quote.material.replace('_', ' ').toUpperCase(),
            // Sending the specific dimensions over to EmailJS
            length: state.quote.rawDimensionsString,
            width: "N/A",
            thickness: "N/A",
            distance: state.quote.distance,
            base_price: state.totals.base.toFixed(2),
            labor_cost: state.totals.labor.toFixed(2),
            logistics_cost: state.totals.logistics.toFixed(2),
            tax_cost: state.totals.fees.toFixed(2),
            total_price: state.totals.grand.toFixed(2)
        };
        try {
            await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);
            alert("PDF Generated & Manifest emailed successfully.");
        } catch (err) {
            console.error("EmailJS Error:", err);
            alert("PDF Generated. (Email dispatch skipped - check credentials).");
        }
    }

    btn.innerText = "FINALIZE & DISPATCH QUOTE";
    btn.disabled = false;
});

/* ------------------------------------------------------------------
 * 7. ADMIN DASHBOARD SYNC
 * ------------------------------------------------------------------ */
let clickCount = 0; let clickTimer;
document.getElementById('admin-trigger').addEventListener('click', () => {
    clickCount++;
    clearTimeout(clickTimer);
    if (clickCount >= 5) {
        if (state.user && state.user.email === ADMIN_EMAIL) {
            document.getElementById('admin-view').classList.remove('hidden-step');
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } else {
            alert("ACCESS DENIED: Unauthorized clearance level.");
        }
        clickCount = 0;
    }
    clickTimer = setTimeout(() => { clickCount = 0; }, 3000);
});

// Pushes updates to your "settings/global_vars" document collection
document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured.");

    const newVars = {
        rate_carbon: parseFloat(document.getElementById('admin-rate-carbon').value),
        rate_stainless: parseFloat(document.getElementById('admin-rate-stainless').value),
        rate_aluminum: parseFloat(document.getElementById('admin-rate-aluminum').value),
        labor_cost: parseFloat(document.getElementById('admin-labor').value),
        logistics_per_mile: parseFloat(document.getElementById('admin-logistics').value),
        tax_rate: parseFloat(document.getElementById('admin-tax').value),
        profit_margin: parseFloat(document.getElementById('admin-margin').value)
    };

    const docRef = doc(db, "settings", "global_vars");
    try {
        const btn = e.target.querySelector('button');
        btn.innerText = "SYNCING...";
        // setDoc with { merge: true } creates the document if it doesn't exist yet
        await setDoc(docRef, newVars, { merge: true });
        setTimeout(() => { btn.innerText = "UPDATE SYSTEM VARIABLES"; }, 1000);
    } catch (err) {
        console.error("Error updating config:", err);
        alert("Failed to sync config to Firestore.");
    }
});