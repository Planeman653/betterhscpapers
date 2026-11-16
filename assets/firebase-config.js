/* Firebase project used for logins, ticks, flags and community questions.
   The web config is public by design; access is controlled by firestore.rules. Set to null to switch logins off. */
window.HSC_FIREBASE = {
  apiKey: "AIzaSyAnMfyaQJcjT-XVjdXpwQ0QcB_z0-VqpaM",
  authDomain: "betterhscpapers.firebaseapp.com",
  projectId: "betterhscpapers",
  storageBucket: "betterhscpapers.firebasestorage.app",
  messagingSenderId: "593991431974",
  appId: "1:593991431974:web:6e7b0851b0a22ea78633e7",
};
/* Accounts with admin rights (must match firestore.rules). */
window.HSC_ADMINS = ["jamestanudji@gmail.com"];
