document.getElementById("verifyForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = localStorage.getItem("email");
    const verificationCode = document.getElementById("verificationCode").value.trim();

    console.log(`📤 Sending Code for Verification: ${verificationCode}`);

    if (!verificationCode) {
        alert("Please enter the verification code.");
        return;
    }

    const response = await fetch("/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, verificationCode })
    });

    const data = await response.json();
    console.log("📥 Server Response:", data);

    if (data.success) {
        alert("Email Verified Successfully!");
        window.location.href = "login.html";
    } else {
        alert("Error: " + data.message);
    }
});
