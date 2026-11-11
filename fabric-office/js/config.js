/*
  ربط النظام أونلاين (اختياري)
  ----------------------------------
  لو عايز تشغل النظام من أكتر من جهاز وبحسابات للموظفين:
  اتبع الخطوات في ملف SETUP_ONLINE.md والصق بيانات Firebase هنا بدل null.

  مثال:
  window.FIREBASE_CONFIG = {
    apiKey: "AIza...",
    authDomain: "my-shop.firebaseapp.com",
    projectId: "my-shop",
    storageBucket: "my-shop.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
  };

  لو سبتها null، النظام هيشتغل على الجهاز ده بس (بدون إنترنت).
*/
window.FIREBASE_CONFIG = null;
