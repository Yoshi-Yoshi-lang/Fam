document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("inputForm");
    const tableBody = document.getElementById("tableBody");
    const resetBtn = document.getElementById("resetBtn");
    let products = JSON.parse(localStorage.getItem("products")) || [];

    updateTable();

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const productName = document.getElementById("productName").value;
        const width = document.getElementById("width").value ? parseFloat(document.getElementById("width").value) : null;
        const length = parseFloat(document.getElementById("length").value);
        const multiplier = parseFloat(document.getElementById("multiplier").value);
        const rolls = parseInt(document.getElementById("rolls").value, 10);
        const price = parseFloat(document.getElementById("price").value);

        if (!productName || !length || !multiplier || !rolls || !price) {
            alert("必須項目をすべて入力してください");
            return;
        }

        const effectiveLengthPerRoll = length * multiplier;
        const totalEffectiveLength = effectiveLengthPerRoll * rolls;
        const pricePerMeter = (price / totalEffectiveLength).toFixed(2);

        products.push({
            name: productName,
            width: width, 
            length: length,
            multiplier: multiplier,
            rolls: rolls,
            price: price,
            pricePerMeter: parseFloat(pricePerMeter),
        });

        saveToLocalStorage();
        updateTable();
        form.reset();
    });

    function updateTable() {
        products.sort((a, b) => a.pricePerMeter - b.pricePerMeter);
        const minPrice = products.length > 0 ? products[0].pricePerMeter : null;

        tableBody.innerHTML = "";

        products.forEach((product, index) => {
            const row = document.createElement("tr");
            if (product.pricePerMeter === minPrice) {
                row.style.backgroundColor = "#ffeb3b";
            }

            row.innerHTML = `
                <td>${product.name}</td>
                <td>${product.width !== null ? product.width : "-"}</td>
                <td>${product.length}</td>
                <td>${product.multiplier}倍</td>
                <td>${product.rolls}</td>
                <td>${product.price}</td>
                <td>${product.pricePerMeter}</td>
                <td><button class="delete-btn" data-index="${index}">削除</button></td>
            `;

            tableBody.appendChild(row);
        });

        document.querySelectorAll(".delete-btn").forEach((button) => {
            button.addEventListener("click", function () {
                const index = this.getAttribute("data-index");
                products.splice(index, 1);
                saveToLocalStorage();
                updateTable();
            });
        });
    }

    function saveToLocalStorage() {
        localStorage.setItem("products", JSON.stringify(products));
    }

    resetBtn.addEventListener("click", function () {
        if (confirm("全てのデータを削除しますか？")) {
            products = [];
            saveToLocalStorage();
            updateTable();
        }
    });
});
