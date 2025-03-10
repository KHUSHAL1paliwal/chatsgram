document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const age = parseInt(document.getElementById("age").value.trim());
    const gender = document.getElementById("gender").value;

    console.log("📤 Sending Registration Data:", { username, email, password, age, gender });

    if (!username || !email || !password || isNaN(age) || !gender) {
        alert("Please fill in all fields correctly.");
        return;
    }

    try {
        const response = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, email, password, age, gender })
        });

        const data = await response.json();
        console.log("📥 Server Response:", data);

        if (data.success) {
            sessionStorage.setItem("username", username);
            sessionStorage.setItem("email", email);
            sessionStorage.setItem("age", age);
            sessionStorage.setItem("gender", gender);
            

            alert("Verification code sent to your email.");
            window.location.href = "verify.html";
        } else {
            alert("Error: " + data.message);
        }
    } catch (error) {
        alert("Failed to connect to the server.");
        console.error("❌ Registration Error:", error);
    }
});
