document.addEventListener("DOMContentLoaded", function () {
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

    // Current category
    let currentCategory = "toilet";

    // Load from localStorage with migration
    let products = JSON.parse(localStorage.getItem("toilet-products")) || [];

    // Data migration
    products = products.map(p => ({
        ...p,
        category: p.category || "toilet",
        store: p.store || "",
        memo: p.memo || "",
        registeredAt: p.registeredAt || null
    }));
    products = products.filter(p => p.category !== "kitchen");
    saveToLocalStorage();

    // Initialize
    updateResults();
    initPillSelectors();
    initStoreSuggestions();
    initFormToggle();

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
            { container: "#sheetsButtons", input: "#sheetsPerBox" },
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
    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const productName = document.getElementById("productName").value.trim();
        const storeName = document.getElementById("storeName").value.trim();
        const price = parseFloat(document.getElementById("price").value);
        const memo = document.getElementById("memo").value.trim();

        if (!productName || !price) {
            showToast("商品名と価格を入力してください");
            return;
        }

        let product = {
            id: Date.now(),
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
            const sheetsPerBox = parseInt(document.getElementById("sheetsPerBox").value, 10) || 0;
            const boxes = parseInt(document.getElementById("boxes").value, 10) || 0;

            const totalSheets = sheetsPerBox * boxes;
            const pricePerUnit = price / totalSheets;

            product = {
                ...product,
                sheetsPerBox,
                boxes,
                totalAmount: totalSheets,
                pricePerUnit: parseFloat(pricePerUnit.toFixed(3)),
                unit: "枚"
            };
        }

        products.push(product);
        saveToLocalStorage();
        updateResults();

        // Reset form
        document.getElementById("productName").value = "";
        document.getElementById("storeName").value = "";
        document.getElementById("price").value = "";
        document.getElementById("memo").value = "";
        if (document.getElementById("length")) {
            document.getElementById("length").value = "";
        }

        showToast("追加しました ✓");

        // Collapse form after adding
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
            const originalIndex = products.indexOf(product);

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
                        <button class="delete-btn" data-index="${originalIndex}">×</button>
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
            button.addEventListener("click", function () {
                const index = parseInt(this.getAttribute("data-index"), 10);
                if (confirm("削除しますか？")) {
                    products.splice(index, 1);
                    saveToLocalStorage();
                    updateResults();
                    showToast("削除しました");
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
                    <span class="stat-value">${product.sheetsPerBox}枚</span>
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

    function saveToLocalStorage() {
        localStorage.setItem("toilet-products", JSON.stringify(products));
    }

    // ===== Reset =====
    resetBtn.addEventListener("click", function () {
        const count = products.filter(p => p.category === currentCategory).length;
        if (count === 0) {
            showToast("削除する商品がありません");
            return;
        }

        const categoryName = currentCategory === "toilet" ? "トイレットペーパー" : "ティッシュ";
        if (confirm(`${categoryName}のデータを全て削除しますか？`)) {
            products = products.filter(p => p.category !== currentCategory);
            saveToLocalStorage();
            updateResults();
            showToast("削除しました");
        }
    });
});
