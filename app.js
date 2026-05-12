/* ------------------------------------------------------------------
 * 1. FIREBASE INIT & CONFIGURATION
 * ------------------------------------------------------------------ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
// IMPORTANT: REPLACE WITH YOUR ADMIN EMAIL
const ADMIN_EMAIL = "admin@yourdomain.com";

// IMPORTANT: REPLACE WITH YOUR EMAILJS CREDENTIALS
const EMAILJS_PUBLIC_KEY = "YOUR_EMAILJS_PUBLIC_KEY";
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (e) {
    console.warn("Firebase not properly configured. UI will function in dummy mode.", e);
}

/* ------------------------------------------------------------------
 * 2. STATE MANAGEMENT
 * ------------------------------------------------------------------ */
let state = {
    user: null,
    quote: { category: '', length: 0, width: 0, thickness: 0, material: '', distance: 0 },
    totals: { base: 0, labor: 0, logistics: 0, fees: 0, grand: 0 }
};

// Default fallbacks if Firestore isn't connected
let globalVars = {
    market_rate: 0.85,
    labor_cost: 150.00,
    logistics_per_mile: 2.50,
    tax_rate: 7.0,
    profit_margin: 20.0
};

/* ------------------------------------------------------------------
 * 3. DOM ELEMENT CACHING & UI HELPERS
 * ------------------------------------------------------------------ */
const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3'),
    document.getElementById('step-4'),
    document.getElementById('step-5')
];

function showStep(index) {
    steps.forEach((el, i) => {
        if (i === index) {
            el.classList.remove('hidden-step');
            // Small delay to allow display:block to apply before animating opacity
            setTimeout(() => el.classList.add('fade-enter-active'), 10);
        } else {
            el.classList.remove('fade-enter-active');
            el.classList.add('hidden-step');
        }
    });
}

/* ------------------------------------------------------------------
 * 4. AUTHENTICATION (STEP 1)
 * ------------------------------------------------------------------ */
document.getElementById('btn-google-login').addEventListener('click', async () => {
    if (!auth) return alert("Firebase not configured.");
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Auth error", error);
    }
});

if (auth) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.user = user;
            document.getElementById('user-badge').classList.remove('hidden');
            document.getElementById('user-email-display').innerText = user.email;
            document.getElementById('input-final-email').value = user.email;
            showStep(1); // Move to Step 2

            // Setup real-time listener after auth
            setupFirestoreListener();
        } else {
            showStep(0);
        }
    });
} else {
    // Bypass mode if no firebase config (for testing layout)
    document.getElementById('btn-google-login').addEventListener('click', () => showStep(1));
}

/* ------------------------------------------------------------------
 * 5. CUSTOMER JOURNEY (STEPS 2-4)
 * ------------------------------------------------------------------ */
// Step 2: Category
document.querySelectorAll('.category-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        state.quote.category = e.currentTarget.getAttribute('data-category');
        showStep(2);
    });
});

// Step 3: Requirements
document.getElementById('requirements-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.quote.length = parseFloat(document.getElementById('input-length').value);
    state.quote.width = parseFloat(document.getElementById('input-width').value);
    state.quote.thickness = parseFloat(document.getElementById('input-thickness').value);
    state.quote.material = document.getElementById('input-material').value;
    showStep(3);
});

/* ------------------------------------------------------------------
 * 6. GEOLOCATION & HAVERSINE (STEP 4)
 * ------------------------------------------------------------------ */
// Plant location (Lancaster, SC)
const PLANT_LAT = 34.7203;
const PLANT_LNG = -80.7709;

function getHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Radius of Earth in miles
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

document.getElementById('btn-geolocate').addEventListener('click', () => {
    const btn = document.getElementById('btn-geolocate');
    btn.innerHTML = '<span class="animate-pulse font-mono">CALCULATING SATELLITE FIX...</span>';

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const dist = getHaversineDistance(
                    PLANT_LAT, PLANT_LNG,
                    position.coords.latitude, position.coords.longitude
                );
                state.quote.distance = Math.round(dist);

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
    } else {
        alert("Geolocation not supported.");
    }
});

document.getElementById('btn-step4-next').addEventListener('click', () => {
    updateQuoteCalculation();
    showStep(4);
});

/* ------------------------------------------------------------------
 * 7. LIVE CALCULATION & FIRESTORE SYNC (STEP 5 & ADMIN)
 * ------------------------------------------------------------------ */
function setupFirestoreListener() {
    if (!db) return;
    const docRef = doc(db, "settings", "global_vars");

    onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            globalVars = docSnap.data();

            // Update admin panel inputs if they are visible
            document.getElementById('admin-market').value = globalVars.market_rate;
            document.getElementById('admin-labor').value = globalVars.labor_cost;
            document.getElementById('admin-logistics').value = globalVars.logistics_per_mile;
            document.getElementById('admin-tax').value = globalVars.tax_rate;
            document.getElementById('admin-margin').value = globalVars.profit_margin;

            // Re-calculate live if user is currently on step 5
            if (!document.getElementById('step-5').classList.contains('hidden-step')) {
                updateQuoteCalculation();
            }
        }
    });
}

function updateQuoteCalculation() {
    const volume = state.quote.length * state.quote.width * state.quote.thickness;

    // Logic Math
    const baseCost = volume * globalVars.market_rate;
    const laborCost = parseFloat(globalVars.labor_cost);
    const logisticsCost = state.quote.distance * globalVars.logistics_per_mile;

    const subtotal = baseCost + laborCost + logisticsCost;
    const marginVal = subtotal * (globalVars.profit_margin / 100);
    const totalWithMargin = subtotal + marginVal;
    const taxVal = totalWithMargin * (globalVars.tax_rate / 100);

    const grandTotal = totalWithMargin + taxVal;
    const feesTotal = marginVal + taxVal;

    // Store in state for PDF/Email
    state.totals = {
        base: baseCost, labor: laborCost, logistics: logisticsCost, fees: feesTotal, grand: grandTotal
    };

    // Update DOM
    document.getElementById('out-sector').innerText = state.quote.category;
    document.getElementById('out-volume').innerText = volume.toFixed(2);
    document.getElementById('out-material').innerText = state.quote.material.replace('_', ' ');
    document.getElementById('out-distance').innerText = state.quote.distance;

    document.getElementById('cost-base').innerText = `$${baseCost.toFixed(2)}`;
    document.getElementById('cost-labor').innerText = `$${laborCost.toFixed(2)}`;
    document.getElementById('cost-logistics').innerText = `$${logisticsCost.toFixed(2)}`;
    document.getElementById('cost-fees').innerText = `$${feesTotal.toFixed(2)}`;
    document.getElementById('cost-total').innerText = `$${grandTotal.toFixed(2)}`;
}

/* ------------------------------------------------------------------
 * 8. OUTPUT GENERATION (PDF & EMAILJS)
 * ------------------------------------------------------------------ */
document.getElementById('btn-finalize').addEventListener('click', async () => {
    const btn = document.getElementById('btn-finalize');
    btn.innerText = "GENERATING...";
    btn.disabled = true;

    const finalEmail = document.getElementById('input-final-email').value;

    // --- ACTION 1: jsPDF Generation ---
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF();

    // Draw Dark Theme
    pdf.setFillColor(10, 10, 10);
    pdf.rect(0, 0, 210, 297, 'F');

    // Typography (Emulating retro dot-matrix using Courier)
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("courier", "bold");
    pdf.setFontSize(24);
    pdf.text("SYS.QUOTE // MANIFEST", 20, 30);

    pdf.setTextColor(255, 0, 49); // Nothing Red
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
    pdf.text(`DIMS:     ${state.quote.length}" x ${state.quote.width}" x ${state.quote.thickness}"`, 20, 90);
    pdf.text(`ROUTING:  ${state.quote.distance} MILES`, 20, 100);

    pdf.line(20, 110, 190, 110);

    pdf.text("FINANCIALS:", 20, 125);
    pdf.text(`BASE MTL: $${state.totals.base.toFixed(2)}`, 20, 135);
    pdf.text(`LABOR:    $${state.totals.labor.toFixed(2)}`, 20, 145);
    pdf.text(`LOGISTCS: $${state.totals.logistics.toFixed(2)}`, 20, 155);
    pdf.text(`FEES/TAX: $${state.totals.fees.toFixed(2)}`, 20, 165);

    pdf.setFont("courier", "bold");
    pdf.setTextColor(255, 0, 49);
    pdf.setFontSize(16);
    pdf.text(`AUTHORIZED TOTAL: $${state.totals.grand.toFixed(2)}`, 20, 185);

    // Trigger Download
    pdf.save(`SYS_QUOTE_${Date.now()}.pdf`);

    // --- ACTION 2: EmailJS Dispatch ---
    if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY !== "YOUR_EMAILJS_PUBLIC_KEY") {
        emailjs.init(EMAILJS_PUBLIC_KEY);

        // Updated payload to match the new HTML template
        const templateParams = {
            to_email: finalEmail,
            quote_id: `QTE-${Date.now().toString().slice(-6)}`,
            category: state.quote.category.toUpperCase(),
            material: state.quote.material.replace('_', ' ').toUpperCase(),
            length: state.quote.length,
            width: state.quote.width,
            thickness: state.quote.thickness,
            distance: state.quote.distance,
            base_price: state.totals.base.toFixed(2),
            labor_cost: state.totals.labor.toFixed(2),
            logistics_cost: state.totals.logistics.toFixed(2),
            tax_cost: state.totals.fees.toFixed(2),
            total_price: state.totals.grand.toFixed(2)
        };

        try {
            await emailjs.send(steel_plant, template_t3p2ttj, templateParams);
            alert("PDF Generated & Manifest emailed successfully.");
        } catch (err) {
            console.error("EmailJS Error:", err);
            alert("PDF Generated. (Email dispatch skipped - check credentials).");
        }
    }

    btn.innerText = "GENERATE PDF & EMAIL MANIFEST";
    btn.disabled = false;
});

/* ------------------------------------------------------------------
 * 9. ADMIN DASHBOARD LOGIC
 * ------------------------------------------------------------------ */
let clickCount = 0;
let clickTimer;

document.getElementById('admin-trigger').addEventListener('click', () => {
    clickCount++;
    clearTimeout(clickTimer);

    // 5 clicks within 3 seconds unlocks admin (if email matches)
    if (clickCount >= 5) {
        if (state.user && state.user.email === ADMIN_EMAIL) {
            document.getElementById('admin-view').classList.remove('hidden-step');
            // Scroll to bottom
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        } else {
            alert("ACCESS DENIED: Unauthorized clearance level.");
        }
        clickCount = 0;
    }

    clickTimer = setTimeout(() => { clickCount = 0; }, 3000);
});

document.getElementById('admin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!db) return alert("Firebase not configured.");

    const newVars = {
        market_rate: parseFloat(document.getElementById('admin-market').value),
        labor_cost: parseFloat(document.getElementById('admin-labor').value),
        logistics_per_mile: parseFloat(document.getElementById('admin-logistics').value),
        tax_rate: parseFloat(document.getElementById('admin-tax').value),
        profit_margin: parseFloat(document.getElementById('admin-margin').value)
    };

    const docRef = doc(db, "settings", "global_vars");
    try {
        const btn = e.target.querySelector('button');
        btn.innerText = "SYNCING...";
        await updateDoc(docRef, newVars);
        setTimeout(() => { btn.innerText = "UPDATE SYSTEM VARIABLES"; }, 1000);
    } catch (err) {
        console.error("Error updating config:", err);
        alert("Failed to sync config to Firestore.");
    }
})