// ===== Firebase Integration =====
let currentUser = null;
let products = [];

// Wait for Firebase to be ready
function waitForFirebase() {
    return new Promise((resolve) => {
        if (window.firebaseAuth) {
            resolve();
        } else {
            window.addEventListener('firebase-ready', resolve, { once: true });
        }
    });
}

// ===== Firestore Operations =====
async function loadProductsFromFirestore() {
    if (!currentUser) return [];
    
    const { collection, getDocs } = window.firebaseFunctions;
    const db = window.firebaseDb;
    
    try {
        const productsRef = collection(db, 'users', currentUser.uid, 'products');
        const snapshot = await getDocs(productsRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error('Failed to load products:', e);
        return [];
    }
}

async function saveProductToFirestore(product) {
    if (!currentUser) return;
    
    const { collection, addDoc } = window.firebaseFunctions;
    const db = window.firebaseDb;
    
    try {
        const productsRef = collection(db, 'users', currentUser.uid, 'products');
        const docRef = await addDoc(productsRef, product);
        return docRef.id;
    } catch (e) {
        console.error('Failed to save product:', e);
        throw e;
    }
}

async function deleteProductFromFirestore(productId) {
    if (!currentUser) return;
    
    const { doc, deleteDoc } = window.firebaseFunctions;
    const db = window.firebaseDb;
    
    try {
        const productRef = doc(db, 'users', currentUser.uid, 'products', productId);
        await deleteDoc(productRef);
    } catch (e) {
        console.error('Failed to delete product:', e);
        throw e;
    }
}

async function clearProductsByCategoryFromFirestore(category) {
    if (!currentUser) return;
    
    const { collection, getDocs, doc, deleteDoc, query, where } = window.firebaseFunctions;
    const db = window.firebaseDb;
    
    try {
        const productsRef = collection(db, 'users', currentUser.uid, 'products');
        const q = query(productsRef, where('category', '==', category));
        const snapshot = await getDocs(q);
        
        const deletePromises = snapshot.docs.map(docSnap => 
            deleteDoc(doc(db, 'users', currentUser.uid, 'products', docSnap.id))
        );
        await Promise.all(deletePromises);
    } catch (e) {
        console.error('Failed to clear products:', e);
        throw e;
    }
}

// ===== Main Application =====
document.addEventListener("DOMContentLoaded", async function () {
    // Wait for Firebase
    await waitForFirebase();
    
    const auth = window.firebaseAuth;
    const provider = window.firebaseProvider;
    const { signInWithPopup, signOut, onAuthStateChanged } = window.firebaseFunctions;

    // DOM Elements
    const form = document.getElementById("inputForm");
    const resultsCards = document.getElementById("resultsCards");
    const resetBtn = document.getElementById("resetBtn");
    const emptyState = document.getElementById("emptyState");
    const productCount = document.getElementById("productCount");
    const categoryTabs = document.querySelectorAll(".tab-btn");
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toastMessage");
    const storeInput = document.getElementById("storeName");
    const storeSuggestions = document.getElementById("storeSuggestions");

    // Category fields
    const toiletFields = document.querySelector(".toilet-fields");
    const tissueFields = document.querySelector(".tissue-fields");

    // Form toggle elements
    const formToggle = document.getElementById("formToggle");
    const toggleIcon = document.getElementById("toggleIcon");

    // Custom modal elements
    const customModal = document.getElementById("customModal");
    const customInput = document.getElementById("customInput");
    const modalTitle = document.getElementById("modalTitle");
    let currentCustomTarget = null;

    // Auth elements
    const loginOverlay = document.getElementById("loginOverlay");
    const loginBtn = document.getElementById("loginBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const userInfo = document.getElementById("userInfo");
    const userAvatar = document.getElementById("userAvatar");
    const googleLoginBtn = document.getElementById("googleLoginBtn");
    const authLoading = document.getElementById("authLoading");
    const authLoginForm = document.getElementById("authLoginForm");

    // Current category
    let currentCategory = "toilet";

    // ===== Authentication =====
    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        
        // Hide loading, show appropriate state
        if (authLoading) authLoading.style.display = "none";
        
        if (user) {
            // User is signed in
            loginOverlay.classList.add("hidden");
            loginBtn.style.display = "none";
            userInfo.style.display = "flex";
            userAvatar.src = user.photoURL || "";
            
            // Load products from Firestore
            try {
                products = await loadProductsFromFirestore();
            } catch (e) {
                console.error('Failed to load products:', e);
                products = [];
            }
            
            // Check for old local data and migrate (with delay for UI)
            setTimeout(async () => {
                await checkAndMigrateLocalData();
                updateResults();
            }, 500);
            
            updateResults();
            showToast(`ようこそ、${user.displayName || 'ユーザー'}さん`);
        } else {
            // User is signed out - show login form
            if (authLoginForm) authLoginForm.style.display = "block";
            loginOverlay.classList.remove("hidden");
            loginBtn.style.display = "block";
            userInfo.style.display = "none";
            products = [];
            updateResults();
        }
    });

    // ===== Local Data Migration =====
    async function checkAndMigrateLocalData() {
        // Check localStorage
        const localStorageData = localStorage.getItem('toilet-products');
        
        // Check IndexedDB
        let indexedDBData = [];
        try {
            indexedDBData = await getIndexedDBData();
        } catch (e) {
            console.log('No IndexedDB data found');
        }
        
        const localProducts = localStorageData ? JSON.parse(localStorageData) : [];
        const allLocalProducts = [...localProducts, ...indexedDBData];
        
        if (allLocalProducts.length > 0) {
            const shouldMigrate = confirm(
                `📦 旧データが見つかりました！\n\n` +
                `${allLocalProducts.length}件の商品データをクラウドに移行しますか？\n\n` +
                `※移行後、ローカルデータは削除されます`
            );
            
            if (shouldMigrate) {
                try {
                    let migratedCount = 0;
                    for (const product of allLocalProducts) {
                        // Check if product already exists in Firestore (by name and price)
                        const exists = products.some(p => 
                            p.name === product.name && 
                            p.price === product.price &&
                            p.category === product.category
                        );
                        
                        if (!exists) {
                            const productData = {
                                name: product.name || '名称不明',
                                store: product.store || '',
                                price: product.price || 0,
                                memo: product.memo || '',
                                category: product.category || 'toilet',
                                registeredAt: product.registeredAt || new Date().toISOString(),
                                length: product.length,
                                multiplier: product.multiplier,
                                rolls: product.rolls,
                                pairsPerBox: product.pairsPerBox,
                                boxes: product.boxes,
                                totalAmount: product.totalAmount,
                                pricePerUnit: product.pricePerUnit,
                                unit: product.unit
                            };
                            
                            const docId = await saveProductToFirestore(productData);
                            productData.id = docId;
                            products.push(productData);
                            migratedCount++;
                        }
                    }
                    
                    // Clear local data after successful migration
                    localStorage.removeItem('toilet-products');
                    await clearIndexedDB();
                    
                    showToast(`✅ ${migratedCount}件のデータを移行しました`);
                } catch (e) {
                    console.error('Migration failed:', e);
                    // Show detailed error for debugging on mobile
                    const errorMsg = e.message || e.code || 'Unknown error';
                    alert(`❌ 移行エラー\n\n${errorMsg}\n\nFirestoreルールを確認してください`);
                    showToast('移行に失敗しました');
                }
            } else {
                // User declined, clear local data anyway to avoid asking again
                const clearLocal = confirm('ローカルデータを削除しますか？\n（削除しないと次回も確認されます）');
                if (clearLocal) {
                    localStorage.removeItem('toilet-products');
                    await clearIndexedDB();
                    showToast('ローカルデータを削除しました');
                }
            }
        }
    }

    async function getIndexedDBData() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('FamProductsDB', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('products')) {
                    db.close();
                    resolve([]);
                    return;
                }
                
                const transaction = db.transaction(['products'], 'readonly');
                const store = transaction.objectStore('products');
                const getAllRequest = store.getAll();
                
                getAllRequest.onerror = () => {
                    db.close();
                    reject(getAllRequest.error);
                };
                getAllRequest.onsuccess = () => {
                    db.close();
                    resolve(getAllRequest.result || []);
                };
            };
        });
    }

    async function clearIndexedDB() {
        return new Promise((resolve) => {
            const request = indexedDB.deleteDatabase('FamProductsDB');
            request.onsuccess = () => resolve();
            request.onerror = () => resolve(); // Ignore errors
        });
    }

    // Login handlers
    async function handleLogin() {
        try {
            await signInWithPopup(auth, provider);
        } catch (e) {
            console.error('Login failed:', e);
            showToast("ログインに失敗しました");
        }
    }

    googleLoginBtn.addEventListener("click", handleLogin);
    loginBtn.addEventListener("click", handleLogin);

    logoutBtn.addEventListener("click", async () => {
        try {
            await signOut(auth);
            showToast("ログアウトしました");
        } catch (e) {
            console.error('Logout failed:', e);
        }
    });

    // Initialize UI
    initPillSelectors();
    initStoreSuggestions();
    initFormToggle();
    initCustomModal();

    // ===== Form Toggle =====
    function initFormToggle() {
        formToggle.addEventListener("click", function () {
            const isExpanded = formToggle.getAttribute("aria-expanded") === "true";
            toggleForm(!isExpanded);
        });
    }

    function toggleForm(expand) {
        formToggle.setAttribute("aria-expanded", expand);
        if (expand) {
            form.classList.remove("collapsed");
        } else {
            form.classList.add("collapsed");
        }
    }

    // ===== Pill Selectors =====
    function initPillSelectors() {
        const selectors = [
            { container: "#multiplierButtons", input: "#multiplier" },
            { container: "#rollButtons", input: "#rolls" },
            { container: "#pairsButtons", input: "#pairsPerBox" },
            { container: "#boxButtons", input: "#boxes" }
        ];

        selectors.forEach(({ container, input }) => {
            const containerEl = document.querySelector(container);
            const inputEl = document.querySelector(input);

            if (!containerEl || !inputEl) return;

            containerEl.querySelectorAll(".pill-btn").forEach(btn => {
                btn.addEventListener("click", function () {
                    containerEl.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
                    this.classList.add("active");
                    inputEl.value = this.dataset.value;
                });
            });
        });
    }

    // ===== Custom Modal =====
    function initCustomModal() {
        document.querySelectorAll(".custom-btn").forEach(btn => {
            btn.addEventListener("click", function (e) {
                e.preventDefault();
                currentCustomTarget = this.dataset.custom;

                const titles = {
                    multiplier: "何倍巻き？（カスタム）",
                    rolls: "ロール数（カスタム）",
                    pairsPerBox: "組数（カスタム）",
                    boxes: "箱数（カスタム）"
                };

                modalTitle.textContent = titles[currentCustomTarget] || "カスタム値";
                customInput.value = "";
                customInput.placeholder = "値を入力";

                customModal.classList.add("show");
                setTimeout(() => customInput.focus(), 100);
            });
        });

        document.getElementById("modalClose").addEventListener("click", closeModal);
        document.getElementById("modalCancel").addEventListener("click", closeModal);

        document.getElementById("modalConfirm").addEventListener("click", function () {
            const value = parseFloat(customInput.value);
            if (!value || value <= 0) {
                customInput.classList.add("error");
                return;
            }

            const inputEl = document.getElementById(currentCustomTarget);
            if (inputEl) {
                inputEl.value = value;
            }

            const containerMap = {
                multiplier: "#multiplierButtons",
                rolls: "#rollButtons",
                pairsPerBox: "#pairsButtons",
                boxes: "#boxButtons"
            };

            const container = document.querySelector(containerMap[currentCustomTarget]);
            if (container) {
                container.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
                const customBtn = container.querySelector(".custom-btn");
                if (customBtn) {
                    customBtn.classList.add("active");
                    customBtn.textContent = value % 1 === 0 ? value.toString() : value.toFixed(1);
                }
            }

            closeModal();
            showToast(`${value} に設定しました`);
        });

        customModal.addEventListener("click", function (e) {
            if (e.target === customModal) {
                closeModal();
            }
        });

        customInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter") {
                document.getElementById("modalConfirm").click();
            }
        });
    }

    function closeModal() {
        customModal.classList.remove("show");
        customInput.classList.remove("error");
        currentCustomTarget = null;
    }

    // ===== Store Suggestions =====
    function initStoreSuggestions() {
        storeInput.addEventListener("focus", showStoreSuggestions);
        storeInput.addEventListener("input", showStoreSuggestions);

        document.addEventListener("click", function (e) {
            if (!storeInput.contains(e.target) && !storeSuggestions.contains(e.target)) {
                storeSuggestions.classList.remove("show");
            }
        });
    }

    function showStoreSuggestions() {
        const stores = getUniqueStores();
        const inputValue = storeInput.value.toLowerCase();

        const filteredStores = stores.filter(store =>
            store.toLowerCase().includes(inputValue)
        );

        if (filteredStores.length === 0) {
            storeSuggestions.classList.remove("show");
            return;
        }

        storeSuggestions.innerHTML = filteredStores.map(store =>
            `<div class="store-suggestion-item">${escapeHtml(store)}</div>`
        ).join("");

        storeSuggestions.classList.add("show");

        document.querySelectorAll(".store-suggestion-item").forEach(item => {
            item.addEventListener("click", function () {
                storeInput.value = this.textContent;
                storeSuggestions.classList.remove("show");
            });
        });
    }

    function getUniqueStores() {
        return products
            .map(p => p.store)
            .filter(s => s && s.trim())
            .filter((s, i, arr) => arr.indexOf(s) === i);
    }

    // ===== Category Tabs =====
    categoryTabs.forEach(tab => {
        tab.addEventListener("click", function () {
            categoryTabs.forEach(t => t.classList.remove("active"));
            this.classList.add("active");

            currentCategory = this.dataset.category;

            toiletFields.classList.add("hidden");
            tissueFields.classList.add("hidden");

            if (currentCategory === "toilet") {
                toiletFields.classList.remove("hidden");
            } else if (currentCategory === "tissue") {
                tissueFields.classList.remove("hidden");
            }

            updateResults();
        });
    });

    // ===== Form Submit =====
    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!currentUser) {
            showToast("ログインしてください");
            return;
        }

        const productName = document.getElementById("productName").value.trim();
        const storeName = document.getElementById("storeName").value.trim();
        const price = parseFloat(document.getElementById("price").value);
        const memo = document.getElementById("memo").value.trim();

        if (!productName || !price) {
            showToast("商品名と価格を入力してください");
            return;
        }

        let product = {
            name: productName,
            store: storeName,
            price: price,
            memo: memo,
            category: currentCategory,
            registeredAt: new Date().toISOString()
        };

        if (currentCategory === "toilet") {
            const length = parseFloat(document.getElementById("length").value) || 0;
            const multiplier = parseFloat(document.getElementById("multiplier").value) || 1;
            const rolls = parseInt(document.getElementById("rolls").value, 10) || 0;

            if (!length) {
                showToast("長さを入力してください");
                return;
            }

            const totalLength = length * multiplier * rolls;
            const pricePerUnit = price / totalLength;

            product = {
                ...product,
                length,
                multiplier,
                rolls,
                totalAmount: totalLength,
                pricePerUnit: parseFloat(pricePerUnit.toFixed(3)),
                unit: "m"
            };
        } else if (currentCategory === "tissue") {
            const pairsPerBox = parseInt(document.getElementById("pairsPerBox").value, 10) || 0;
            const boxes = parseInt(document.getElementById("boxes").value, 10) || 0;

            const totalPairs = pairsPerBox * boxes;
            const pricePerUnit = price / totalPairs;

            product = {
                ...product,
                pairsPerBox,
                boxes,
                totalAmount: totalPairs,
                pricePerUnit: parseFloat(pricePerUnit.toFixed(3)),
                unit: "組"
            };
        }

        try {
            const docId = await saveProductToFirestore(product);
            product.id = docId;
            products.push(product);
            updateResults();
            showToast("追加しました ✓");
        } catch (e) {
            showToast("保存に失敗しました");
            return;
        }

        // Reset form
        document.getElementById("productName").value = "";
        document.getElementById("storeName").value = "";
        document.getElementById("price").value = "";
        document.getElementById("memo").value = "";
        if (document.getElementById("length")) {
            document.getElementById("length").value = "";
        }

        toggleForm(false);
    });

    // ===== Update Results =====
    function updateResults() {
        const filteredProducts = products.filter(p => p.category === currentCategory);

        filteredProducts.sort((a, b) => {
            const priceA = a.pricePerUnit || a.pricePerMeter || 0;
            const priceB = b.pricePerUnit || b.pricePerMeter || 0;
            return priceA - priceB;
        });

        productCount.textContent = filteredProducts.length > 0
            ? `${filteredProducts.length}件`
            : "";

        if (filteredProducts.length === 0) {
            emptyState.style.display = "block";
            resultsCards.innerHTML = "";
            return;
        }
        emptyState.style.display = "none";

        resultsCards.innerHTML = filteredProducts.map((product, index) => {
            const rank = index + 1;
            const pricePerUnit = product.pricePerUnit || product.pricePerMeter || 0;
            const dateStr = product.registeredAt
                ? new Date(product.registeredAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })
                : '';

            let rankClass = "";
            let badgeClass = "normal";
            let badgeText = `${rank}位`;

            if (rank === 1) {
                rankClass = "rank-1";
                badgeClass = "gold";
                badgeText = "🏆 最安";
            } else if (rank === 2) {
                rankClass = "rank-2";
                badgeClass = "silver";
                badgeText = "2位";
            } else if (rank === 3) {
                rankClass = "rank-3";
                badgeClass = "bronze";
                badgeText = "3位";
            }

            const stats = getProductStats(product);

            return `
                <div class="result-card ${rankClass}">
                    <div class="rank-badge ${badgeClass}">${badgeText}</div>
                    <div class="card-header">
                        <div class="card-info">
                            <div class="card-title">${escapeHtml(product.name)}</div>
                            <div class="card-store">${escapeHtml(product.store) || '店舗未設定'}</div>
                            ${dateStr ? `<div class="card-date">${dateStr}</div>` : ''}
                        </div>
                        <button class="delete-btn" data-id="${product.id}">×</button>
                    </div>
                    <div class="card-stats">
                        ${stats}
                    </div>
                    <div class="unit-price-display">
                        <span class="unit-price-value">${pricePerUnit.toFixed(2)}</span>
                        <span class="unit-price-unit">円/${product.unit || 'm'}</span>
                    </div>
                    ${product.memo ? `<div class="card-memo">📝 ${escapeHtml(product.memo)}</div>` : ''}
                </div>
            `;
        }).join("");

        // Delete button events
        document.querySelectorAll(".delete-btn").forEach((button) => {
            button.addEventListener("click", async function () {
                const productId = this.getAttribute("data-id");
                if (confirm("削除しますか？")) {
                    try {
                        await deleteProductFromFirestore(productId);
                        products = products.filter(p => p.id !== productId);
                        updateResults();
                        showToast("削除しました");
                    } catch (e) {
                        showToast("削除に失敗しました");
                    }
                }
            });
        });
    }

    function getProductStats(product) {
        if (product.category === "toilet") {
            return `
                <div class="stat-chip">
                    <span class="stat-label">価格</span>
                    <span class="stat-value">¥${product.price.toLocaleString()}</span>
                </div>
                <div class="stat-chip">
                    <span class="stat-label">長さ</span>
                    <span class="stat-value">${product.length}m × ${product.multiplier}倍</span>
                </div>
                <div class="stat-chip">
                    <span class="stat-label">本数</span>
                    <span class="stat-value">${product.rolls}本</span>
                </div>
            `;
        } else if (product.category === "tissue") {
            return `
                <div class="stat-chip">
                    <span class="stat-label">価格</span>
                    <span class="stat-value">¥${product.price.toLocaleString()}</span>
                </div>
                <div class="stat-chip">
                    <span class="stat-label">1箱</span>
                    <span class="stat-value">${product.pairsPerBox || product.sheetsPerBox}組</span>
                </div>
                <div class="stat-chip">
                    <span class="stat-label">箱数</span>
                    <span class="stat-value">${product.boxes}箱</span>
                </div>
            `;
        }
        return "";
    }

    // ===== Toast =====
    function showToast(message) {
        toastMessage.textContent = message;
        toast.classList.add("show");

        setTimeout(() => {
            toast.classList.remove("show");
        }, 2000);
    }

    // ===== Utilities =====
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===== Reset =====
    resetBtn.addEventListener("click", async function () {
        if (!currentUser) {
            showToast("ログインしてください");
            return;
        }

        const count = products.filter(p => p.category === currentCategory).length;
        if (count === 0) {
            showToast("削除する商品がありません");
            return;
        }

        const categoryName = currentCategory === "toilet" ? "トイレットペーパー" : "ティッシュ";
        if (confirm(`${categoryName}のデータを全て削除しますか？`)) {
            try {
                await clearProductsByCategoryFromFirestore(currentCategory);
                products = products.filter(p => p.category !== currentCategory);
                updateResults();
                showToast("削除しました");
            } catch (e) {
                showToast("削除に失敗しました");
            }
        }
    });
});
