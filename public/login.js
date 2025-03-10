console.log("✅ login.js loaded successfully!"); // Debugging log

document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    console.log(`📤 Sending Login Data: Email = ${email}, Password = ${password}`);

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        console.log("📥 Server Response:", data);

        if (data.success) {
            alert("Login Successful! Redirecting...");
            sessionStorage.setItem("username", data.user.username); 
            sessionStorage.setItem("email", data.user.email);
            sessionStorage.setItem("age", data.user.age || "Not Set");
             sessionStorage.setItem("gender", data.user.gender || "Not Set"); // Save user info
            window.location.href = "profile.html"; // Redirect to profile page
        } else {
            alert("Error: " + data.message);
        }
    } catch (error) {
        alert("Failed to connect to the server.");
        console.error("❌ Login Error:", error);
    }
});
