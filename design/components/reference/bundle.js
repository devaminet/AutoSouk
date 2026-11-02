/* @ds-bundle: {"format":4,"namespace":"AutoSouk","components":[{"name":"Icon"},{"name":"IconButton"},{"name":"Logo"},{"name":"Button"},{"name":"Badge"},{"name":"Chip"},{"name":"EquipmentPill"},{"name":"EquipmentGroup"},{"name":"Avatar"},{"name":"Input"},{"name":"Toggle"},{"name":"Checkbox"},{"name":"Radio"},{"name":"Segmented"},{"name":"CarPhoto"},{"name":"Rating"},{"name":"SpecItem"},{"name":"ListingCard"},{"name":"MechanicCard"},{"name":"ReviewItem"},{"name":"StatCard"},{"name":"ScoreRing"},{"name":"ChecklistRow"},{"name":"InspectionTimeline"},{"name":"Stepper"},{"name":"UploadTile"},{"name":"MediaLimits"},{"name":"Tabs"},{"name":"Pagination"},{"name":"MapView"},{"name":"ZelligePattern"},{"name":"RoleSwitch"},{"name":"NavDesktop"},{"name":"MobileHeader"},{"name":"StatusBar"},{"name":"TabBar"},{"name":"Footer"},{"name":"LanguageSwitch"}]} */
(function () {
  var R = window.React, h = R.createElement, F = R.Fragment;
  var ICONS = {"search":"<circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/>","heart":"<path d=\"M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z\"/>","map-pin":"<path d=\"M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/>","star":"<polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"/>","chevron-right":"<path d=\"m9 18 6-6-6-6\"/>","chevron-left":"<path d=\"m15 18-6-6 6-6\"/>","chevron-down":"<path d=\"m6 9 6 6 6-6\"/>","check":"<path d=\"M20 6 9 17l-5-5\"/>","x":"<path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/>","plus":"<path d=\"M5 12h14\"/><path d=\"M12 5v14\"/>","upload":"<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"17 8 12 3 7 8\"/><line x1=\"12\" x2=\"12\" y1=\"3\" y2=\"15\"/>","download":"<path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" x2=\"12\" y1=\"15\" y2=\"3\"/>","user":"<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>","users":"<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/>","car":"<path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\"/><circle cx=\"7\" cy=\"17\" r=\"2\"/><path d=\"M9 17h6\"/><circle cx=\"17\" cy=\"17\" r=\"2\"/>","wrench":"<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z\"/>","shield":"<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/><path d=\"m9 12 2 2 4-4\"/>","file":"<path d=\"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z\"/><path d=\"M14 2v4a2 2 0 0 0 2 2h4\"/><path d=\"M10 9H8\"/><path d=\"M16 13H8\"/><path d=\"M16 17H8\"/>","calendar":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/><path d=\"M16 2v4\"/><path d=\"M8 2v4\"/><path d=\"M3 10h18\"/>","gauge":"<path d=\"m12 14 4-4\"/><path d=\"M3.34 19a10 10 0 1 1 17.32 0\"/>","fuel":"<line x1=\"3\" x2=\"15\" y1=\"22\" y2=\"22\"/><line x1=\"4\" x2=\"14\" y1=\"9\" y2=\"9\"/><path d=\"M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18\"/><path d=\"M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5\"/>","sliders":"<line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\"/><line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\"/><line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\"/><line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\"/><line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\"/><line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\"/><line x1=\"14\" x2=\"14\" y1=\"2\" y2=\"6\"/><line x1=\"8\" x2=\"8\" y1=\"10\" y2=\"14\"/><line x1=\"16\" x2=\"16\" y1=\"18\" y2=\"22\"/>","bell":"<path d=\"M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9\"/><path d=\"M10.3 21a1.94 1.94 0 0 0 3.4 0\"/>","menu":"<line x1=\"4\" x2=\"20\" y1=\"12\" y2=\"12\"/><line x1=\"4\" x2=\"20\" y1=\"6\" y2=\"6\"/><line x1=\"4\" x2=\"20\" y1=\"18\" y2=\"18\"/>","arrow-right":"<path d=\"M5 12h14\"/><path d=\"m12 5 7 7-7 7\"/>","arrow-left":"<path d=\"m12 19-7-7 7-7\"/><path d=\"M19 12H5\"/>","phone":"<path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z\"/>","clock":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><polyline points=\"12 6 12 12 16 14\"/>","camera":"<path d=\"M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z\"/><circle cx=\"12\" cy=\"13\" r=\"3\"/>","trash":"<path d=\"M3 6h18\"/><path d=\"M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6\"/><path d=\"M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2\"/>","pencil":"<path d=\"M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z\"/><path d=\"m15 5 4 4\"/>","eye":"<path d=\"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>","logout":"<path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><polyline points=\"16 17 21 12 16 7\"/><line x1=\"21\" x2=\"9\" y1=\"12\" y2=\"12\"/>","lock":"<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>","mail":"<rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\"/><path d=\"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7\"/>","alert-triangle":"<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>","image":"<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\"/>","grid":"<rect width=\"7\" height=\"7\" x=\"3\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"3\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"14\" y=\"14\" rx=\"1\"/><rect width=\"7\" height=\"7\" x=\"3\" y=\"14\" rx=\"1\"/>","home":"<path d=\"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/>","message":"<path d=\"M7.9 20A9 9 0 1 0 4 16.1L2 22Z\"/>","share":"<circle cx=\"18\" cy=\"5\" r=\"3\"/><circle cx=\"6\" cy=\"12\" r=\"3\"/><circle cx=\"18\" cy=\"19\" r=\"3\"/><line x1=\"8.59\" x2=\"15.42\" y1=\"13.51\" y2=\"17.49\"/><line x1=\"15.41\" x2=\"8.59\" y1=\"6.51\" y2=\"10.49\"/>","info":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 16v-4\"/><path d=\"M12 8h.01\"/>","award":"<circle cx=\"12\" cy=\"8\" r=\"6\"/><path d=\"M15.477 12.89 17 22l-5-3-5 3 1.523-9.11\"/>","gearbox":"<circle cx=\"5\" cy=\"6\" r=\"2\"/><circle cx=\"12\" cy=\"6\" r=\"2\"/><circle cx=\"19\" cy=\"6\" r=\"2\"/><circle cx=\"5\" cy=\"18\" r=\"2\"/><circle cx=\"12\" cy=\"18\" r=\"2\"/><path d=\"M5 8v8M12 8v8M19 8v4H5\"/>","door":"<path d=\"M13 4h3a2 2 0 0 1 2 2v14\"/><path d=\"M2 20h3\"/><path d=\"M13 20h9\"/><path d=\"M10 12v.01\"/><path d=\"M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z\"/>","zap":"<path d=\"M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z\"/>","globe":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\"/><path d=\"M2 12h20\"/>","inbox":"<polyline points=\"22 12 16 12 14 15 10 15 8 12 2 12\"/><path d=\"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\"/>","hash":"<line x1=\"4\" x2=\"20\" y1=\"9\" y2=\"9\"/><line x1=\"4\" x2=\"20\" y1=\"15\" y2=\"15\"/><line x1=\"10\" x2=\"8\" y1=\"3\" y2=\"21\"/><line x1=\"16\" x2=\"14\" y1=\"3\" y2=\"21\"/>","more-horizontal":"<circle cx=\"12\" cy=\"12\" r=\"1\"/><circle cx=\"19\" cy=\"12\" r=\"1\"/><circle cx=\"5\" cy=\"12\" r=\"1\"/>","check-circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m9 12 2 2 4-4\"/>","x-circle":"<circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"m15 9-6 6\"/><path d=\"m9 9 6 6\"/>","refresh":"<path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\"/><path d=\"M21 3v5h-5\"/><path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\"/><path d=\"M8 16H3v5\"/>","key":"<circle cx=\"7.5\" cy=\"15.5\" r=\"5.5\"/><path d=\"m21 2-9.6 9.6\"/><path d=\"m15.5 7.5 3 3L22 7l-3-3\"/>","play":"<polygon points=\"6 3 20 12 6 21 6 3\"/>","power":"<path d=\"M12 2v10\"/><path d=\"M18.4 6.6a9 9 0 1 1-12.77.04\"/>","armchair":"<path d=\"M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3\"/><path d=\"M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z\"/><path d=\"M5 18v2\"/><path d=\"M19 18v2\"/>","music":"<path d=\"M9 18V5l12-2v13\"/><circle cx=\"6\" cy=\"18\" r=\"3\"/><circle cx=\"18\" cy=\"16\" r=\"3\"/>","navigation":"<polygon points=\"3 11 22 2 13 21 11 13 3 11\"/>"};
  var cx = function () { return Array.prototype.slice.call(arguments).filter(Boolean).join(' '); };
  var v = function (c) { return c ? (/^(#|rgb|hsl|var\()/.test(c) ? c : 'var(--' + c + ')') : 'currentColor'; };
  var STAR = 'M12 0L13.53 4.3L16.59 1.91L17.68 6.32L21.24 4.76L21.03 9.32L24 10.3L21.49 12.68L23.67 16.17L19.11 16.83L19.18 21.05L15.24 19.62L13.53 23.7L12 21.05L10.47 23.7L8.76 19.62L4.82 21.05L4.89 16.83L0.33 16.17L2.51 12.68L0 10.3L2.97 9.32L2.76 4.76L6.32 6.32L7.41 1.91L10.47 4.3Z';


  // UI strings owned by the client, in the three API languages. Status, role and verdict words mirror the API's enums catalog
  // (GET /api/i18n/{locale}/enums) so both sides say the same thing. Pass lang="fr" | "ar" to any text component.
  var I18N = {
    en: { dir: 'ltr', nav: ['Explore cars', 'Sell a car', 'Mechanics', 'Inspections'], login: 'Log in', signup: 'Create account',
      roles: { Buyer: 'Buyer', Seller: 'Seller', Mechanic: 'Mechanic' },
      tabs: { Explore: 'Explore', Saved: 'Saved', Sell: 'Sell', Inspections: 'Inspections', Account: 'Account', Queue: 'Queue', Reports: 'Reports', Workshop: 'Workshop', Reviews: 'Reviews' },
      inspected: 'Inspected', mad: 'MAD', inspection: 'Inspection', request: 'Request', reviews: function (n) { return '(' + n + ' reviews)'; }, verified: 'Verified',
      yourReview: 'Your review', edit: 'Edit', del: 'Delete',
      chk: { pass: 'Pass', attention: 'Needs attention', fail: 'Fail' },
      timeline: ['Pending', 'Accepted', 'In progress', 'Completed'], rejected: 'Rejected',
      steps: ['Listing', 'Car details', 'Photos', 'Review'],
      addPhoto: 'Add photo', cover: 'Cover', video: 'Video', ready: 'Ready to confirm', uploading: 'Uploading', failed: 'Upload failed', retry: 'Retry', makeCover: 'Make cover', keep3: 'Keep at least 3 photos',
      media: function (i, v, u) { return i + (i === 1 ? ' photo' : ' photos') + (v ? ' · ' + v + (v === 1 ? ' video' : ' videos') : '') + (u ? ' · ' + u + ' uploading' : ''); },
      files: function (a, b) { return a + ' / ' + b + ' files'; }, atLeast: function (m) { return 'At least ' + m + ' photos'; }, addMore: function (n, m) { return 'Add ' + n + ' more photo' + (n === 1 ? '' : 's') + ' (min. ' + m + ')'; },
      coverPhoto: 'Cover is a photo', left: function (n) { return n + ' files left'; }, full: 'File limit reached',
      of: function (a, b) { return a + ' of ' + b; }, more: function (n) { return '+ ' + n + ' more'; },
      footCols: [['Marketplace', ['Explore cars', 'Sell a car', 'Favorites', 'Price guide']], ['Trust', ['Inspections', 'Find a mechanic', 'Mechanic rankings', 'Sample report']], ['Company', ['About', 'Become a partner garage', 'Help center', 'Contact']]],
      tagline: "Morocco's trusted marketplace for cars and the independent mechanics who inspect them.", legal: '© 2026 AutoSouk · Casablanca, Morocco', legalLinks: 'Privacy · Terms', language: 'Language' },
    fr: { dir: 'ltr', nav: ['Voitures', 'Vendre', 'Mécaniciens', 'Inspections'], login: 'Se connecter', signup: 'Créer un compte',
      roles: { Buyer: 'Acheteur', Seller: 'Vendeur', Mechanic: 'Mécanicien' },
      tabs: { Explore: 'Explorer', Saved: 'Favoris', Sell: 'Vendre', Inspections: 'Inspections', Account: 'Compte', Queue: 'Demandes', Reports: 'Rapports', Workshop: 'Atelier', Reviews: 'Avis' },
      inspected: 'Inspectée', mad: 'MAD', inspection: 'Inspection', request: 'Demander', reviews: function (n) { return '(' + n + ' avis)'; }, verified: 'Vérifié',
      yourReview: 'Votre avis', edit: 'Modifier', del: 'Supprimer',
      chk: { pass: 'Conforme', attention: 'À surveiller', fail: 'Défaillant' },
      timeline: ['En attente', 'Acceptée', 'En cours', 'Terminée'], rejected: 'Refusée',
      steps: ['Annonce', 'Véhicule', 'Photos', 'Vérification'],
      addPhoto: 'Ajouter une photo', cover: 'Couverture', video: 'Vidéo', ready: 'Prête à confirmer', uploading: 'Envoi', failed: "Échec de l'envoi", retry: 'Réessayer', makeCover: 'Mettre en couverture', keep3: 'Gardez au moins 3 photos',
      media: function (i, v, u) { return i + ' photo' + (i > 1 ? 's' : '') + (v ? ' · ' + v + ' vidéo' + (v > 1 ? 's' : '') : '') + (u ? ' · ' + u + ' en cours d’envoi' : ''); },
      files: function (a, b) { return a + ' / ' + b + ' fichiers'; }, atLeast: function (m) { return 'Au moins ' + m + ' photos'; }, addMore: function (n, m) { return 'Ajoutez encore ' + n + ' photo' + (n > 1 ? 's' : '') + ' (min. ' + m + ')'; },
      coverPhoto: 'La couverture est une photo', left: function (n) { return n + ' fichier' + (n > 1 ? 's' : '') + ' restant' + (n > 1 ? 's' : ''); }, full: 'Limite de fichiers atteinte',
      of: function (a, b) { return a + ' sur ' + b; }, more: function (n) { return '+ ' + n + ' autres'; },
      footCols: [['Marché', ['Voitures', 'Vendre une voiture', 'Favoris', 'Guide des prix']], ['Confiance', ['Inspections', 'Trouver un mécanicien', 'Classement des garages', 'Exemple de rapport']], ['Société', ['À propos', 'Devenir garage partenaire', 'Aide', 'Contact']]],
      tagline: 'Le marché de confiance du Maroc pour les voitures et les mécaniciens indépendants qui les inspectent.', legal: '© 2026 AutoSouk · Casablanca, Maroc', legalLinks: 'Confidentialité · Conditions', language: 'Langue' },
    ar: { dir: 'rtl', nav: ['تصفح السيارات', 'بيع سيارة', 'الميكانيكيون', 'الفحوصات'], login: 'تسجيل الدخول', signup: 'إنشاء حساب',
      roles: { Buyer: 'مشتري', Seller: 'بائع', Mechanic: 'ميكانيكي' },
      tabs: { Explore: 'استكشاف', Saved: 'المحفوظة', Sell: 'بيع', Inspections: 'الفحوصات', Account: 'حسابي', Queue: 'الطلبات', Reports: 'التقارير', Workshop: 'الورشة', Reviews: 'التقييمات' },
      inspected: 'مفحوصة', mad: 'درهم', inspection: 'الفحص', request: 'اطلب', reviews: function (n) { return '(' + n + ' تقييم)'; }, verified: 'موثّق',
      yourReview: 'تقييمك', edit: 'تعديل', del: 'حذف',
      chk: { pass: 'سليم', attention: 'يحتاج إلى مراقبة', fail: 'معطل' },
      timeline: ['قيد الانتظار', 'مقبول', 'جارٍ', 'مكتمل'], rejected: 'مرفوض',
      steps: ['الإعلان', 'السيارة', 'الصور', 'المراجعة'],
      addPhoto: 'أضف صورة', cover: 'الغلاف', video: 'فيديو', ready: 'جاهز للتأكيد', uploading: 'جارٍ الرفع', failed: 'فشل الرفع', retry: 'أعد المحاولة', makeCover: 'اجعلها الغلاف', keep3: 'احتفظ بثلاث صور على الأقل',
      media: function (i, v, u) { return 'الصور: ' + i + (v ? ' · الفيديو: ' + v : '') + (u ? ' · قيد الرفع: ' + u : ''); },
      files: function (a, b) { return 'الملفات: ' + a + ' من ' + b; }, atLeast: function (m) { return 'الحد الأدنى ' + m + ' صور'; }, addMore: function (n, m) { return 'أضف صورًا أخرى: ' + n + ' (الحد الأدنى ' + m + ')'; },
      coverPhoto: 'الغلاف صورة', left: function (n) { return 'الملفات المتبقية: ' + n; }, full: 'تم بلوغ الحد الأقصى للملفات',
      of: function (a, b) { return a + ' من ' + b; }, more: function (n) { return '+ ' + n + ' أخرى'; },
      footCols: [['السوق', ['تصفح السيارات', 'بيع سيارة', 'المحفوظة', 'دليل الأسعار']], ['الثقة', ['الفحوصات', 'ابحث عن ميكانيكي', 'ترتيب الورشات', 'نموذج تقرير']], ['الشركة', ['من نحن', 'انضم كورشة شريكة', 'مركز المساعدة', 'اتصل بنا']]],
      tagline: 'سوق المغرب الموثوق للسيارات وللميكانيكيين المستقلين الذين يفحصونها.', legal: '© 2026 AutoSouk · الدار البيضاء، المغرب', legalLinks: 'الخصوصية · الشروط', language: 'اللغة' }
  };
  var LANGS = [['fr', 'Français', 'FR'], ['en', 'English', 'EN'], ['ar', 'العربية', 'ع']];
  function S(p) { return I18N[(p && p.lang) || 'en'] || I18N.en; }
  var FLIP = { 'arrow-left': 1, 'arrow-right': 1, 'chevron-left': 1, 'chevron-right': 1, logout: 1, navigation: 1 };

  function starPath(cx0, cy0, R0) { var d = ''; for (var i = 0; i < 16; i++) { var a = -Math.PI / 2 + i * Math.PI / 8; var r = i % 2 === 0 ? R0 : R0 * 0.765; d += (i ? 'L' : 'M') + (cx0 + r * Math.cos(a)).toFixed(2) + ' ' + (cy0 + r * Math.sin(a)).toFixed(2) + ' '; } return d + 'Z'; }

  function Icon(p) {
    var s = p.size || 20, fill = p.fill ? v(p.fill) : 'none';
    return h('svg', { className: cx('as-icon', FLIP[p.name] && 'as-flip', p.className), width: s, height: s, viewBox: '0 0 24 24', fill: fill, stroke: v(p.color), strokeWidth: p.strokeWidth || 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': p.label ? undefined : true, 'aria-label': p.label, role: p.label ? 'img' : undefined, dangerouslySetInnerHTML: { __html: ICONS[p.name] || '' } });
  }

  // Mark: a car on a Majorelle tile, riding on two zellige-star wheels, with a saffron 8-point star badge (inspected & trusted).
  var CAR_BODY = 'M3.6 14.6 C3.6 13.3 4.4 12.6 5.8 12.4 L7.4 12.2 L9.4 9.6 C9.9 9 10.5 8.7 11.3 8.7 L15.2 8.7 C16 8.7 16.6 9 17.1 9.6 L18.8 12.1 L19.4 12.2 C20.4 12.4 20.9 13 20.9 13.9 L20.9 15.4 C20.9 15.8 20.6 16.1 20.2 16.1 L3.9 16.1 C3.7 16.1 3.6 15.9 3.6 15.7 Z';
  var CAR_WIN = 'M10.3 10.2 C10.5 9.9 10.8 9.8 11.2 9.8 L13.6 9.8 L13.6 12.1 L8.9 12.1 Z M14.6 9.8 L15.3 9.8 C15.7 9.8 16 10 16.2 10.3 L17.4 12.1 L14.6 12.1 Z';
  function starN(cx0, cy0, R0, ri, n) { var d = ''; for (var i = 0; i < 2 * n; i++) { var a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? ri : R0; d += (i ? 'L' : 'M') + (cx0 + r * Math.cos(a)).toFixed(2) + ' ' + (cy0 + r * Math.sin(a)).toFixed(2) + ' '; } return d + 'Z'; }
  function LogoMark(dark, s) {
    var bg = dark ? '#FFFFFF' : 'var(--brand)', car = dark ? 'var(--brand)' : '#FFFFFF', sf = 'var(--saffron)';
    var wheel = function (x) { return h(F, { key: x }, h('circle', { cx: x, cy: 16.2, r: 2.35, fill: bg }), h('path', { d: starN(x, 16.2, 2.05, 1.55, 8), fill: sf }), h('circle', { cx: x, cy: 16.2, r: .6, fill: bg })); };
    return h('svg', { width: s, height: s, viewBox: '0 0 24 24', 'aria-hidden': true, style: { flex: 'none' } },
      h('rect', { width: 24, height: 24, rx: 6.5, fill: bg }),
      h('g', { transform: 'translate(-1.48 -0.6) scale(1.1)' }, h('path', { d: CAR_BODY, fill: car }), h('path', { d: CAR_WIN, fill: bg }), wheel(7.6), wheel(16.9)),
      h('path', { d: starN(18.6, 6, 2.3, 1.75, 8), fill: sf }));
  }
  function Logo(p) {
    var dark = p.tone === 'dark', s = p.size || 32;
    return h('span', { className: 'as-logo', role: 'img', 'aria-label': 'AutoSouk' },
      LogoMark(dark, s),
      p.markOnly ? null : h('span', { className: 'h3', 'aria-hidden': true, style: { color: dark ? 'var(--surface)' : 'var(--ink)' } }, 'Auto', h('span', { style: { color: dark ? 'var(--saffron)' : 'var(--brand)' } }, 'Souk')));
  }

  var BTN_FG = { primary: 'on-brand', dark: 'surface', secondary: 'ink', ghost: 'ink', danger: 'danger', saffron: 'ink', success: 'on-brand' };
  function Button(p) {
    var variant = p.variant || 'primary', size = p.size || 'M', is = { L: 20, M: 18, S: 16 }[size];
    return h('button', { type: p.type || 'button', disabled: p.disabled, onClick: p.onClick, className: cx('as-btn', 'as-btn-' + variant, 'as-btn-' + size, p.block && 'as-block', p.className), style: p.style },
      p.icon ? h(Icon, { name: p.icon, size: is, color: BTN_FG[variant] }) : null,
      h('span', null, p.children),
      p.iconRight ? h(Icon, { name: p.iconRight, size: is, color: BTN_FG[variant] }) : null);
  }

  function Badge(p) { var tone = p.tone || 'neutral'; return h('span', { className: cx('as-badge', 'as-t-' + tone, 'label-s') }, p.dot === false ? null : h('i', null), h('span', null, p.children)); }

  function Chip(p) {
    var on = !!p.selected;
    return h('span', { className: cx('as-chip', on && 'is-on', 'label-m'), onClick: p.onClick, role: p.onClick ? 'button' : undefined },
      p.icon ? h(Icon, { name: p.icon, size: 16, color: on ? 'surface' : 'ink' }) : null, h('span', null, p.children),
      p.removable ? h(Icon, { name: 'x', size: 14, color: on ? 'surface' : 'muted' }) : null);
  }

  var AV = { XS: [24, 'label-s'], S: [32, 'label-s'], M: [40, 'label-m'], L: [56, 'h5'], XL: [96, 'h2'] };
  var AVT = { brand: ['brand-soft', 'brand-ink'], saffron: ['saffron', 'ink'], ink: ['ink', 'surface'], night: ['night-2', 'surface'] };
  function Avatar(p) { var a = AV[p.size || 'M'], t = AVT[p.tone || 'brand']; return h('span', { className: cx('as-avatar', a[1]), style: { width: a[0], height: a[0], background: v(t[0]), color: v(t[1]) } }, p.initials); }

  function Input(p) {
    var st = p.state || (p.value ? 'filled' : 'default'), val = p.value || p.placeholder || '';
    return h('label', { className: cx('as-field', p.className), style: p.style },
      p.label ? h('span', { className: 'label-m' }, p.label) : null,
      h('span', { className: cx('as-box', 'as-st-' + st, p.multiline && 'is-multi'), style: p.multiline ? { minHeight: p.rows ? p.rows * 24 + 24 : 104 } : null },
        p.icon ? h(Icon, { name: p.icon, size: 18, color: 'muted' }) : null,
        h('span', { className: cx('as-val', p.mono ? 'mono-m' : 'body-m', (st === 'default' || st === 'disabled') && 'is-ph') }, val),
        p.suffix ? h('span', { className: 'mono-s', style: { color: 'var(--muted)' } }, p.suffix) : null,
        p.select ? h(Icon, { name: 'chevron-down', size: 18, color: 'muted' }) : null),
      p.helper ? h('span', { className: 'body-xs', style: { color: st === 'error' ? 'var(--danger)' : 'var(--muted)' } }, p.helper) : null);
  }

  function EquipmentPill(p) {
    var on = !!p.selected;
    return h('span', { className: cx('as-eqp', on && 'is-on', 'label-m'), onClick: p.onClick, role: 'checkbox', 'aria-checked': on, tabIndex: p.onClick ? 0 : undefined },
      h(Icon, { name: on ? 'check' : 'plus', size: 14, color: on ? 'brand' : 'muted', strokeWidth: on ? 2.5 : 2 }), h('span', null, p.children));
  }

  function EquipmentGroup(p) {
    var mode = p.mode || 'view', open = p.open !== false, items = (p.items || []).map(function (it) { return typeof it === 'string' ? { name: it, selected: true } : it; });
    var picked = items.filter(function (it) { return it.selected; }), total = p.total || items.length;
    var shown = mode === 'view' ? picked : items, max = p.max && shown.length > p.max ? p.max : 0, rest = max ? shown.length - max : 0;
    if (max) shown = shown.slice(0, max);
    var count = mode === 'select'
      ? h(Badge, { tone: picked.length ? 'brand' : 'neutral', dot: false }, S(p).of(picked.length, total))
      : h('span', { className: 'mono-s', style: { color: 'var(--muted)' } }, picked.length);
    return h('section', { className: cx('as-eqg', p.flush && 'is-flush'), style: p.style },
      h('div', { className: 'as-row as-ac', style: { gap: 12 } },
        h('span', { className: 'as-ibox', style: { width: 36, height: 36 } }, h(Icon, { name: p.icon || 'check-circle', size: 18 })),
        h('span', { className: 'h5 as-f1' }, p.title), count,
        p.collapsible ? h('span', { style: { display: 'inline-flex', transform: open ? 'rotate(180deg)' : 'none' } }, h(Icon, { name: 'chevron-down', size: 18, color: 'muted' })) : null),
      !open ? (picked.length ? h('p', { className: 'body-s as-trunc', style: { margin: 0, marginTop: 10, marginInlineStart: 48, color: 'var(--muted)' } }, picked.map(function (it) { return it.name; }).join(' · ')) : null)
      : mode === 'select'
        ? h('div', { className: 'as-eqp-wrap' }, shown.map(function (it) { return h(EquipmentPill, { key: it.name, selected: it.selected }, it.name); }), rest ? h('span', { className: 'label-m as-eqmore' }, S(p).more(rest)) : null)
        : h('ul', { className: 'as-eqv' }, shown.map(function (it) { return h('li', { key: it.name, className: 'as-row as-ac', style: { gap: 10 } }, h(Icon, { name: 'check-circle', size: 18, color: 'success' }), h('span', { className: 'body-m' }, it.name)); }), rest ? h('li', { className: 'label-m', style: { color: 'var(--brand)' } }, S(p).more(rest)) : null));
  }

  function Toggle(p) { return h('span', { className: cx('as-toggle', p.on && 'is-on'), role: 'switch', 'aria-checked': !!p.on }, h('i')); }
  function Checkbox(p) { return h('span', { className: cx('as-cbox', p.checked && 'is-on'), role: 'checkbox', 'aria-checked': !!p.checked }, p.checked ? h(Icon, { name: 'check', size: 14, color: 'on-brand' }) : null); }
  function Radio(p) { return h('span', { className: cx('as-radio', p.checked && 'is-on'), role: 'radio', 'aria-checked': !!p.checked }); }
  function Segmented(p) { return h('span', { className: 'as-seg' }, (p.items || []).map(function (it) { var on = it === p.active; return h('span', { key: it, className: cx('as-seg-i', on && 'is-on', 'label-m') }, it); })); }

  var TONES = { sand: ['#F1EBDF', '#D9CFBC', '#2B2A26'], majorelle: ['#5A4CEB', '#2A1FA8', '#F4F1EA'], clay: ['#F3DDCC', '#D69F80', '#3B2A22'], olive: ['#E6E9D9', '#BFC6A8', '#1F2A22'], night: ['#2E2C48', '#0F0E1C', '#E9E4F7'], sky: ['#E6EEF7', '#B9CEE5', '#13233A'], saffron: ['#FBE3B5', '#EFAE46', '#2A1A08'] };
  var BODY = 'M10 88 C10 76 18 70 34 67 L78 60 C96 44 120 30 150 28 L206 28 C230 28 250 40 268 58 L292 62 C306 64 314 72 314 84 L314 92 C314 96 311 98 307 98 L282 98 C282 84 271 74 258 74 C245 74 234 84 234 98 L102 98 C102 84 91 74 78 74 C65 74 54 84 54 98 L18 98 C13 98 10 95 10 90 Z';
  function CarPhoto(p) {
    var t = TONES[(p.tone || 'sand').toLowerCase()] || TONES.sand, w = p.width || 400, hh = p.height || 300;
    var cw = Math.min(w * 0.78, hh * 1.9), ch = cw * 80 / 308, fl = !!p.fluid;
    var box = fl ? { width: '100%', aspectRatio: String(p.ratio || '4 / 3'), height: 'auto' } : { width: w, height: hh };
    return h('div', { className: cx('as-photo', p.className), role: 'img', 'aria-label': p.alt || 'Car photo', style: Object.assign(box, { borderRadius: p.radius == null ? 18 : p.radius, background: 'linear-gradient(135deg,' + t[0] + ',' + t[1] + ')' }, p.style) },
      h('div', { className: 'as-ph-light' }),
      h('div', { className: 'as-ph-shadow', style: fl ? { width: '72%', left: '14%', top: '62%' } : { width: '72%', left: '14%', top: (hh * 0.5 + ch * 0.62) + 'px' } }),
      h('svg', { style: fl ? { position: 'absolute', left: '50%', top: '50%', width: '74%', height: 'auto', transform: 'translate(-50%,-42%)' } : { position: 'absolute', left: '50%', top: (hh * 0.5 - ch * 0.38) + 'px', transform: 'translateX(-50%)' }, width: fl ? undefined : cw, height: fl ? undefined : ch, viewBox: '8 22 308 80' },
        h('path', { d: BODY, fill: t[2] }), h('path', { d: 'M98 60 C112 46 130 38 150 37 L176 37 L176 60 Z', fill: '#fff', fillOpacity: .35 }), h('path', { d: 'M184 37 L206 37 C224 37 240 46 254 60 L184 60 Z', fill: '#fff', fillOpacity: .35 }),
        h('circle', { cx: 78, cy: 98, r: 19, fill: '#141414' }), h('circle', { cx: 78, cy: 98, r: 8, fill: '#9C9A94' }), h('circle', { cx: 258, cy: 98, r: 19, fill: '#141414' }), h('circle', { cx: 258, cy: 98, r: 8, fill: '#9C9A94' })),
      p.children);
  }

  function Stars(n, s) { var out = []; for (var i = 0; i < 5; i++) out.push(h(Icon, { key: i, name: 'star', size: s, color: i < n ? 'saffron' : 'line-strong', fill: i < n ? 'saffron' : null })); return h('span', { className: 'as-row', style: { gap: 2 } }, out); }
  function Rating(p) { var sm = (p.size || 'S') === 'S'; return h('span', { className: 'as-row as-ac', style: { gap: 6 } }, Stars(Math.round(parseFloat(p.score) || 5), sm ? 14 : 18), p.score ? h('span', { className: sm ? 'label-s' : 'label-m' }, p.score) : null, p.count ? h('span', { className: sm ? 'body-xs' : 'body-s', style: { color: 'var(--muted)' } }, p.count) : null); }

  function SpecItem(p) { return h('div', { className: 'as-row as-ac', style: { gap: 12, width: p.width } }, h('span', { className: 'as-ibox' }, h(Icon, { name: p.icon || 'gauge', size: 20 })), h('span', { className: 'as-col', style: { gap: 2 } }, h('span', { className: 'overline', style: { color: 'var(--muted)' } }, p.label), h('span', { className: 'label-l' }, p.value))); }

  function ListingCard(p) {
    var fl = !!p.fluid, w = p.width || 302, pw = w - 16;
    return h('article', { className: 'as-lcard', style: { width: fl ? '100%' : w } },
      h(CarPhoto, { tone: p.tone, width: pw, height: Math.round(pw * 0.72), radius: 18, fluid: fl, ratio: '25 / 18' },
        h('div', { className: 'as-row as-ac as-sb', style: { position: 'absolute', left: 12, right: 12, top: 12 } },
          p.inspectedScore ? h('span', { className: 'as-pill-w' }, h(Icon, { name: 'shield', size: 14, color: 'success' }), h('span', { className: 'label-s', style: { color: 'var(--success)' } }, S(p).inspected + ' · ' + p.inspectedScore)) : h('span'),
          h('span', { className: 'as-ibtn', style: { width: 36, height: 36, background: 'var(--surface)' } }, h(Icon, { name: 'heart', size: 18, color: p.favorite ? 'danger' : 'ink', fill: p.favorite ? 'danger' : null }))),
        p.photos ? h('span', { className: 'as-pill-d', style: { position: 'absolute', insetInlineStart: 12, bottom: 12 } }, h(Icon, { name: 'camera', size: 12, color: 'surface' }), h('span', { className: 'label-s' }, p.photos)) : null),
      h('div', { className: 'as-col', style: { gap: 6, padding: '14px 8px 8px' } },
        h('div', { className: 'h5 as-trunc' }, p.title), h('div', { className: 'body-s', style: { color: 'var(--muted)' } }, p.meta),
        h('div', { className: 'as-row as-ac as-sb', style: { paddingTop: 8 } },
          h('span', { className: 'as-row', style: { gap: 4, alignItems: 'baseline' } }, h('bdi', { className: 'price-m', dir: 'ltr' }, p.price), h('span', { className: 'mono-s', style: { color: 'var(--muted)' } }, S(p).mad)),
          h('span', { className: 'as-row as-ac', style: { gap: 4 } }, h(Icon, { name: 'map-pin', size: 14, color: 'muted' }), h('span', { className: 'label-s', style: { color: 'var(--muted)' } }, p.city)))));
  }

  function MechanicCard(p) {
    return h('article', { className: 'as-card as-col', style: { width: p.width || 360, padding: 20, gap: 16 } },
      h('div', { className: 'as-row as-ac', style: { gap: 14 } }, h(Avatar, { initials: p.initials || 'GA', size: 'L' }),
        h('div', { className: 'as-col as-f1', style: { gap: 2 } }, h('span', { className: 'as-row as-ac', style: { gap: 6 } }, h('span', { className: 'h5' }, p.name), p.verified === false ? null : h(Icon, { name: 'shield', size: 16, color: 'brand', label: S(p).verified })),
          h('span', { className: 'as-row as-ac', style: { gap: 4 } }, h(Icon, { name: 'map-pin', size: 14, color: 'muted' }), h('span', { className: 'body-s', style: { color: 'var(--muted)' } }, p.address)))),
      h(Rating, { score: p.rating || '4.9', count: S(p).reviews(p.reviews || 128) }),
      p.description ? h('p', { className: 'body-s as-clamp2', style: { color: 'var(--ink-2)', margin: 0 } }, p.description) : null,
      h('div', { className: 'as-row as-ac as-sb' }, h('span', { className: 'as-col' }, h('span', { className: 'overline', style: { color: 'var(--muted)' } }, S(p).inspection), h('span', { className: 'as-row', style: { gap: 4, alignItems: 'baseline' } }, h('bdi', { className: 'price-m', dir: 'ltr' }, p.price), h('span', { className: 'mono-s', style: { color: 'var(--muted)' } }, S(p).mad))),
        h(Button, { variant: 'dark', size: 'S' }, p.cta || S(p).request)));
  }

  function ReviewItem(p) {
    return h('div', { className: 'as-col as-review', style: { gap: 12 } },
      h('div', { className: 'as-row as-ac', style: { gap: 12 } }, h(Avatar, { initials: p.initials }),
        h('div', { className: 'as-col as-f1', style: { gap: 2 } }, h('span', { className: 'as-row as-ac', style: { gap: 8 } }, h('span', { className: 'label-m' }, p.name), p.mine ? h(Badge, { tone: 'brand', dot: false }, S(p).yourReview) : null), h('span', { className: 'body-xs', style: { color: 'var(--muted)' } }, p.context)),
        h(Rating, { score: p.score || '5.0' })),
      h('p', { className: 'body-m', style: { margin: 0, color: 'var(--ink-2)' } }, p.message),
      p.mine ? h('div', { className: 'as-row', style: { gap: 8 } }, h(Button, { variant: 'secondary', size: 'S', icon: 'pencil' }, S(p).edit), h(Button, { variant: 'ghost', size: 'S', icon: 'trash' }, S(p).del)) : null);
  }

  function StatCard(p) {
    return h('div', { className: 'as-card as-col', style: { padding: 20, gap: 12, flex: 1, minWidth: 0 } },
      h('div', { className: 'as-row as-ac as-sb' }, h('span', { className: 'label-m', style: { color: 'var(--muted)' } }, p.label), h('span', { className: 'as-ibtn', style: { width: 32, height: 32, borderRadius: 10, background: 'var(--paper)' } }, h(Icon, { name: p.icon || 'car', size: 16 }))),
      h('span', { className: 'display-m' }, p.value), p.trend ? h('span', { className: 'label-s', style: { color: v(p.tone || 'success') } }, p.trend) : null);
  }

  var VERDICT = { excellent: 'success', good: 'brand', fair: 'warning', poor: 'danger' };
  function ScoreRing(p) {
    var size = p.size || 140, score = p.score == null ? 92 : p.score, col = VERDICT[(p.verdict || 'excellent').toLowerCase()] || 'brand', r = 46, C = 2 * Math.PI * r, sw = size <= 70 ? 9 : 7;
    return h('div', { className: 'as-ring', style: { width: size, height: size } },
      h('svg', { width: size, height: size, viewBox: '0 0 100 100' }, h('circle', { cx: 50, cy: 50, r: r, fill: 'none', stroke: 'var(--line)', strokeWidth: sw }),
        h('circle', { cx: 50, cy: 50, r: r, fill: 'none', stroke: v(col), strokeWidth: sw, strokeLinecap: 'round', strokeDasharray: (C * score / 100) + ' ' + C, transform: 'rotate(-90 50 50)' })),
      h('div', { className: 'as-ring-c' }, h('span', { className: size >= 120 ? 'display-m' : size >= 80 ? 'h2' : 'h4' }, score), size >= 80 ? h('span', { className: 'mono-s', style: { color: 'var(--muted)' } }, '/ 100') : null));
  }

  var CHK = { pass: ['success-soft', 'success', 'check', 'success', 'Pass'], attention: ['warning-soft', 'warning', 'alert-triangle', 'warning', 'Attention'], fail: ['danger-soft', 'danger', 'x', 'danger', 'Fail'] };
  function ChecklistRow(p) {
    var m = CHK[(p.status || 'pass').toLowerCase()];
    return h('div', { className: 'as-crow' }, h('span', { className: 'as-cicon', style: { background: v(m[0]) } }, h(Icon, { name: m[2], size: 16, color: m[1] })),
      h('span', { className: 'as-col as-f1', style: { gap: 2 } }, h('span', { className: 'label-m' }, p.item), p.note ? h('span', { className: 'body-s', style: { color: 'var(--muted)' } }, p.note) : null),
      h(Badge, { tone: m[3], dot: false }, S(p).chk[(p.status || 'pass').toLowerCase()] || m[4]));
  }

  function InspectionTimeline(p) {
    var st = S(p).timeline, stage = p.stage || 0;
    return h('div', { className: 'as-row as-ac', style: { gap: 8, flexWrap: 'wrap' } }, st.map(function (s, i) {
      var rej = p.rejected && i === 1, done = i < stage || (stage === 3 && i === 3), on = i === stage && !done;
      var col = rej ? 'var(--danger)' : done ? 'var(--success)' : on ? 'var(--brand)' : 'var(--line-strong)';
      return h(F, { key: s }, h('span', { className: 'as-row as-ac', style: { gap: 8 } },
        h('span', { className: 'as-sdot', style: { width: 22, height: 22, background: done || on || rej ? col : 'var(--surface)', boxShadow: done || on || rej ? 'none' : 'inset 0 0 0 1.5px ' + col } }, done ? h(Icon, { name: 'check', size: 12, color: 'on-brand' }) : rej ? h(Icon, { name: 'x', size: 12, color: 'on-brand' }) : null),
        h('span', { className: 'label-s', style: { color: done || on ? 'var(--ink)' : 'var(--muted)' } }, rej ? S(p).rejected : s)),
        i < 3 ? h('span', { style: { width: 28, height: 2, background: i < stage ? 'var(--success)' : 'var(--line)' } }) : null);
    }));
  }

  function Stepper(p) {
    var steps = p.steps || S(p).steps, a = p.step || 1;
    return h('div', { className: 'as-row as-ac', style: { gap: 12 } }, steps.map(function (s, i) {
      i++; var done = i < a, on = i === a;
      return h(F, { key: s }, h('span', { className: 'as-row as-ac', style: { gap: 10 } },
        h('span', { className: 'as-sdot', style: { background: done ? 'var(--success)' : on ? 'var(--brand)' : 'var(--surface)', boxShadow: i > a ? 'inset 0 0 0 1px var(--line-strong)' : 'none' } }, done ? h(Icon, { name: 'check', size: 14, color: 'on-brand' }) : h('span', { className: 'label-s', style: { color: on ? 'var(--on-brand)' : 'var(--muted)' } }, i)),
        h('span', { className: 'label-m', style: { color: i <= a ? 'var(--ink)' : 'var(--muted)' } }, s)),
        i < steps.length ? h('span', { style: { width: 40, height: 2, borderRadius: 1, background: done ? 'var(--success)' : 'var(--line-strong)' } }) : null);
    }));
  }

  function UploadTile(p) {
    var w = p.width || 180, hh = p.height || 140, st = p.state || 'empty', fl = !!p.fluid;
    var box = fl ? { width: '100%', aspectRatio: String(p.ratio || '4 / 3'), height: 'auto' } : { width: w, height: hh };
    if (st === 'empty') return h('div', { className: 'as-up-empty', style: Object.assign({}, box, { opacity: p.disabled ? 0.5 : 1 }) }, h('span', { className: 'as-ibtn', style: { width: 40, height: 40, background: 'var(--brand-soft)' } }, h(Icon, { name: 'plus', size: 20, color: 'brand' })), h('span', { className: 'label-s' }, p.label || S(p).addPhoto), p.hint ? h('span', { className: 'body-xs', style: { color: 'var(--muted)' } }, p.hint) : null);
    var cover = st === 'cover', vid = !!p.video, act = !!p.actions, t = S(p);
    var ib = function (name, color, label, off) { return h('span', { className: 'as-ibtn', title: label, 'aria-label': label, style: { width: 30, height: 30, background: 'var(--surface)', boxShadow: 'var(--elevation-1)', opacity: off ? 0.55 : 1 } }, h(Icon, { name: name, size: 14, color: color })); };
    return h('div', { className: 'as-up', style: Object.assign({}, box, { boxShadow: cover ? 'inset 0 0 0 3px var(--brand)' : st === 'failed' ? 'inset 0 0 0 2px var(--danger)' : 'none' }) },
      h(CarPhoto, { tone: p.tone, width: w, height: hh, radius: 16, fluid: fl, ratio: p.ratio || '4 / 3', style: fl ? { position: 'absolute', inset: 0, height: '100%' } : null }),
      vid ? h('span', { className: 'as-up-play' }, h(Icon, { name: 'play', size: 18, color: 'ink', fill: 'ink' })) : null,
      st === 'uploading' || st === 'failed' ? null : h('span', { className: 'as-row', style: { position: 'absolute', insetInlineEnd: 8, top: 8, gap: 6 } },
        act && !cover && !vid ? ib('star', 'ink', t.makeCover) : null,
        p.locked ? ib('lock', 'muted', t.keep3, true) : ib('trash', 'danger', t.del)),
      cover ? h('span', { className: 'as-pill-d', style: { position: 'absolute', insetInlineStart: 8, bottom: 8 } }, h(Icon, { name: 'star', size: 12, color: 'saffron', fill: 'saffron' }), h('span', { className: 'label-s' }, t.cover)) : null,
      vid ? h('span', { className: 'as-pill-d', style: { position: 'absolute', insetInlineStart: 8, bottom: 8 } }, h(Icon, { name: 'camera', size: 12, color: 'surface' }), h('span', { className: 'label-s' }, p.duration || t.video)) : null,
      st === 'new' ? h('span', { className: 'as-badge as-t-warning label-s', style: { position: 'absolute', insetInlineStart: 8, top: 8 } }, h('i'), h('span', null, t.ready)) : null,
      st === 'uploading' ? h('div', { className: 'as-up-prog' }, h('span', { className: 'label-s', style: { color: 'var(--surface)' } }, t.uploading + ' ' + (p.progress || 72) + '%'), h('span', { className: 'as-bar' }, h('i', { style: { width: (p.progress || 72) + '%' } }))) : null,
      st === 'failed' ? h('div', { className: 'as-up-prog' }, h(Icon, { name: 'alert-triangle', size: 18, color: 'surface' }), h('span', { className: 'label-s', style: { color: 'var(--surface)' } }, t.failed), h('span', { className: 'as-pill-w label-s', style: { color: 'var(--ink)' } }, h(Icon, { name: 'refresh', size: 12 }), t.retry)) : null);
  }

  function MediaLimits(p) {
    var img = p.images == null ? 9 : p.images, vid = p.videos || 0, pend = p.pending || 0, max = p.max || 20, min = p.min || 3;
    var used = img + vid + pend, okMin = img >= min, full = used >= max, t = S(p);
    var seg = function (n, c) { return n ? h('i', { style: { width: (n / max * 100) + '%', background: c } }) : null; };
    var rule = function (ok, text) { return h('span', { className: 'as-row as-ac', style: { gap: 6 } }, h(Icon, { name: ok ? 'check-circle' : 'alert-triangle', size: 14, color: ok ? 'success' : 'danger' }), h('span', { className: 'body-xs', style: { color: ok ? 'var(--ink-2)' : 'var(--danger)' } }, text)); };
    return h('div', { className: 'as-mlim', style: p.style },
      h('div', { className: 'as-row as-ac as-sb', style: { gap: 12 } },
        h('span', { className: 'label-m' }, t.media(img, vid, pend)),
        h('span', { className: 'mono-s', style: { color: full ? 'var(--danger)' : 'var(--muted)' } }, t.files(used, max))),
      h('span', { className: 'as-mlim-bar', 'aria-hidden': true }, seg(img, 'var(--brand)'), seg(vid, 'var(--ink)'), seg(pend, 'var(--saffron)')),
      p.compact ? null : h('div', { className: 'as-row', style: { gap: 16, flexWrap: 'wrap' } },
        rule(okMin, okMin ? t.atLeast(min) : t.addMore(min - img, min)),
        rule(p.coverIsPhoto !== false, t.coverPhoto),
        rule(!full, full ? t.full : t.left(max - used))));
  }

  function Tabs(p) {
    return h('div', { className: 'as-tabs' }, (p.items || []).map(function (it) {
      var on = it.label === p.active;
      return h('span', { key: it.label, className: 'as-tab' }, h('span', { className: 'as-row as-ac', style: { gap: 6 } }, h('span', { className: 'label-m', style: { color: on ? 'var(--ink)' : 'var(--muted)' } }, it.label), it.count != null ? h('span', { className: cx('as-count', on && 'is-on') }, it.count) : null), h('i', { style: { background: on ? 'var(--ink)' : 'transparent' } }));
    }));
  }

  function Pagination(p) {
    var page = p.page || 1, pages = p.pages || 12, nums = [1, 2, 3, '…', pages];
    return h('div', { className: 'as-row as-ac', style: { gap: 6 } }, h('span', { className: 'as-pg' }, h(Icon, { name: 'chevron-left', size: 16 })),
      nums.map(function (n, i) { return h('span', { key: i, className: cx('as-pg', n === page && 'is-on') }, h('span', { className: 'label-m' }, n)); }),
      h('span', { className: 'as-pg' }, h(Icon, { name: 'chevron-right', size: 16 })));
  }

  var MAPSVG = '<rect width="640" height="420" fill="#ECE7DC"/><path d="M0 0 L190 0 C170 60 120 90 90 150 C60 210 40 260 0 300 Z" fill="#CFE0EA"/><path d="M420 250 C470 230 520 260 540 300 C560 340 520 380 470 370 C430 362 400 330 400 300 C400 280 405 258 420 250Z" fill="#D6E3C8"/><path d="M260 40 C300 60 320 70 360 64 C380 62 392 72 396 90 L360 110 C330 100 300 96 270 84Z" fill="#D6E3C8"/><g stroke="#fff" stroke-linecap="round" fill="none"><path d="M90 420 C150 300 260 230 640 180" stroke-width="14"/><path d="M140 0 C200 120 260 220 330 420" stroke-width="10"/><path d="M0 340 C200 330 400 300 640 330" stroke-width="8"/><path d="M420 0 C430 120 470 240 520 420" stroke-width="8"/><path d="M200 110 L640 70" stroke-width="5"/><path d="M60 230 L600 250" stroke-width="5"/><path d="M300 0 L280 420" stroke-width="4"/><path d="M560 0 L600 420" stroke-width="4"/><path d="M0 120 L260 180" stroke-width="4"/><path d="M120 380 L640 390" stroke-width="3"/></g><path d="M90 420 C150 300 260 230 640 180" stroke="#F4D9A6" stroke-width="4" fill="none"/>';
  var DEFAULT_PINS = [{ x: 39, y: 36, label: '350 MAD', active: true }, { x: 66, y: 21, label: '300 MAD' }, { x: 22, y: 62, label: '400 MAD' }, { x: 73, y: 71, label: '250 MAD' }, { x: 53, y: 79, label: '380 MAD' }];
  function MapView(p) {
    return h('div', { className: 'as-map', style: { width: p.width || '100%', height: p.height || 420, borderRadius: p.radius == null ? 24 : p.radius } },
      h('svg', { width: '100%', height: '100%', viewBox: '0 0 640 420', preserveAspectRatio: 'xMidYMid slice', style: { position: 'absolute', inset: 0 }, dangerouslySetInnerHTML: { __html: MAPSVG } }),
      (p.pins || DEFAULT_PINS).map(function (pin, i) { return h('span', { key: i, className: cx('as-mpin', pin.active && 'is-on', !pin.label && 'is-dot'), style: { left: pin.x + '%', top: pin.y + '%' } }, h('span', { className: 'as-mpi' }, h(Icon, { name: pin.icon || 'wrench', size: 14, color: 'brand' })), pin.label ? h('span', { className: 'label-s' }, pin.label) : null); }),
      p.zoom === false ? null : h('span', { className: 'as-zoom' }, h('span', null, h(Icon, { name: 'plus', size: 16 })), h('span', null, h('i', { style: { width: 12, height: 2, background: 'var(--ink)', display: 'block' } }))),
      p.children);
  }

  // Zellige: 8-point star rosettes and crosses drawn by the Hankin method on the 4.8.8 (octagon-square) tiling,
  // with interlaced ribbons — Majorelle stars, saffron rosettes and crosses on night.
  var ZEL = (function () {
    var s = 40, th = 67.5 * Math.PI / 180, T = s * (1 + Math.SQRT2);
    function poly(cx, cy, n, R, a0) { var o = []; for (var k = 0; k < n; k++) o.push([cx + R * Math.cos(a0 + k * 2 * Math.PI / n), cy + R * Math.sin(a0 + k * 2 * Math.PI / n)]); return o; }
    function rot(v, a) { return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; }
    function hankin(V) {
      var n = V.length, out = [], cx = 0, cy = 0, i;
      for (i = 0; i < n; i++) { cx += V[i][0] / n; cy += V[i][1] / n; }
      for (i = 0; i < n; i++) {
        var A = V[i], B = V[(i + 1) % n], C = V[(i + 2) % n];
        var M1 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], M2 = [(B[0] + C[0]) / 2, (B[1] + C[1]) / 2];
        var sg = ((B[0] - A[0]) * (cy - A[1]) - (B[1] - A[1]) * (cx - A[0])) > 0 ? 1 : -1;
        var d1 = rot([B[0] - M1[0], B[1] - M1[1]], sg * th), d2 = rot([B[0] - M2[0], B[1] - M2[1]], -sg * th);
        var det = -d1[0] * d2[1] + d1[1] * d2[0], rx = M2[0] - M1[0], ry = M2[1] - M1[1], t = (-rx * d2[1] + ry * d2[0]) / det;
        out.push(M1, [M1[0] + t * d1[0], M1[1] + t * d1[1]]);
      }
      return out;
    }
    function pd(pts) { return 'M' + pts.map(function (q) { return q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join('L') + 'Z'; }
    var Ro = s / (2 * Math.sin(Math.PI / 8)), Rs = s / Math.SQRT2, stars = '', roses = '', dots = [];
    [[0, 0], [T, 0], [0, T], [T, T]].forEach(function (c) { stars += pd(hankin(poly(c[0], c[1], 8, Ro, Math.PI / 8))); roses += pd(hankin(poly(c[0], c[1], 8, Ro * 0.42, Math.PI / 8))); dots.push(c); });
    return { T: T, s: s, stars: stars, roses: roses, cross: pd(hankin(poly(T / 2, T / 2, 4, Rs * 0.55, 0))), dots: dots };
  })();
  var zelSeq = 0;
  function ZelligePattern(p) {
    var R0 = R.useRef(null); if (!R0.current) R0.current = 'as-zel-' + (++zelSeq);
    var id = R0.current, w = p.width || 680, hh = p.height || 840, sc = p.scale || 1, fade = p.fade !== false;
    var lines = ZEL.stars + ZEL.cross;
    return h('svg', { className: 'as-pattern', width: w, height: hh, viewBox: '0 0 ' + w + ' ' + hh, 'aria-hidden': true, style: Object.assign({ opacity: p.opacity == null ? .6 : p.opacity }, p.style) },
      h('defs', null,
        h('pattern', { id: id, width: ZEL.T, height: ZEL.T, patternUnits: 'userSpaceOnUse', patternTransform: 'scale(' + sc + ')' },
          h('path', { d: ZEL.stars, fill: '#3F2FD6', fillOpacity: .55 }),
          h('path', { d: ZEL.cross, fill: '#F2A93B', fillOpacity: .9 }),
          h('path', { d: lines, fill: 'none', stroke: '#8E80FF', strokeWidth: ZEL.s * .11, strokeLinejoin: 'round' }),
          h('path', { d: lines, fill: 'none', stroke: '#0F0E1C', strokeWidth: ZEL.s * .045, strokeLinejoin: 'round' }),
          h('path', { d: ZEL.roses, fill: '#F2A93B', fillOpacity: .95 }),
          ZEL.dots.map(function (c, k) { return h('circle', { key: k, cx: c[0], cy: c[1], r: ZEL.s * .07, fill: '#0F0E1C' }); })),
        fade ? h('radialGradient', { id: id + '-g', cx: p.fadeX || '85%', cy: p.fadeY || '25%', r: '85%' }, h('stop', { offset: 0, stopColor: '#fff' }), h('stop', { offset: .55, stopColor: '#fff', stopOpacity: .55 }), h('stop', { offset: 1, stopColor: '#fff', stopOpacity: .12 })) : null,
        fade ? h('mask', { id: id + '-m' }, h('rect', { width: w, height: hh, fill: 'url(#' + id + '-g)' })) : null),
      h('rect', { width: w, height: hh, fill: 'url(#' + id + ')', mask: fade ? 'url(#' + id + '-m)' : undefined }));
  }

  var ROLES = [['Buyer', 'car'], ['Seller', 'grid'], ['Mechanic', 'wrench']];
  function RoleSwitch(p) { var act = p.active || 'Buyer', t = S(p); return h('span', { className: 'as-role' }, ROLES.map(function (r) { var on = r[0] === act; return h('span', { key: r[0], className: cx('as-role-i', on && 'is-on') }, h(Icon, { name: r[1], size: 14, color: on ? 'brand' : 'muted' }), h('span', { className: 'label-s', style: { color: on ? 'var(--ink)' : 'var(--muted)' } }, t.roles[r[0]])); })); }

  function IconButton(p) { return h('span', { className: 'as-ibtn as-ibtn-o', style: { width: p.size || 40, height: p.size || 40, background: v(p.bg || 'surface') } }, h(Icon, { name: p.name, size: (p.size || 40) <= 32 ? 14 : 18, color: p.color || 'ink', fill: p.fill })); }

  // Language switcher. variant 'pill' (header trigger, add open to show the menu), 'segmented' (forms, settings), 'list' (mobile settings rows).
  function LanguageSwitch(p) {
    var cur = p.active || p.lang || 'en', variant = p.variant || 'pill', dark = !!p.dark;
    var name = function (l) { return h('span', { lang: l[0], dir: l[0] === 'ar' ? 'rtl' : 'ltr' }, l[1]); };
    if (variant === 'segmented') return h('span', { className: 'as-seg', role: 'radiogroup', 'aria-label': S(p).language }, LANGS.map(function (l) { var on = l[0] === cur; return h('span', { key: l[0], role: 'radio', 'aria-checked': on, className: cx('as-seg-i', on && 'is-on', 'label-m') }, name(l)); }));
    if (variant === 'list') return h('div', { className: 'as-lang-list', role: 'radiogroup', 'aria-label': S(p).language }, LANGS.map(function (l) { var on = l[0] === cur; return h('span', { key: l[0], role: 'radio', 'aria-checked': on, className: cx('as-lang-row', on && 'is-on') }, h('span', { className: 'as-lang-code mono-s' }, l[2]), h('span', { className: 'label-l as-f1' }, name(l)), on ? h(Icon, { name: 'check', size: 18, color: 'brand' }) : null); }));
    var curL = LANGS.filter(function (l) { return l[0] === cur; })[0] || LANGS[1];
    return h('span', { className: 'as-lang' },
      h('span', { className: cx('as-lang-btn', dark && 'is-dark'), role: 'button', 'aria-haspopup': 'menu', 'aria-expanded': !!p.open, 'aria-label': S(p).language + ': ' + curL[1] },
        h(Icon, { name: 'globe', size: 16, color: dark ? 'surface' : 'ink' }), h('span', { className: 'label-s' }, curL[0].toUpperCase()), h(Icon, { name: 'chevron-down', size: 14, color: dark ? 'subtle' : 'muted' })),
      p.open ? h('span', { className: 'as-lang-menu', role: 'menu' }, LANGS.map(function (l) { var on = l[0] === cur; return h('span', { key: l[0], role: 'menuitemradio', 'aria-checked': on, className: cx('as-lang-item', on && 'is-on') }, h('span', { className: 'as-lang-code mono-s' }, l[2]), h('span', { className: 'label-m as-f1' }, name(l)), on ? h(Icon, { name: 'check', size: 16, color: 'brand' }) : null); })) : null);
  }

  function NavDesktop(p) {
    var t = S(p), links = p.links || t.nav, act = p.active, lang = p.lang || 'en';
    if (act && I18N.en.nav.indexOf(act) > -1 && !p.links) act = t.nav[I18N.en.nav.indexOf(act)];
    act = act || links[0];
    var sw = h(LanguageSwitch, { active: lang, lang: lang, open: p.langOpen });
    return h('header', { className: 'as-nav' },
      h('div', { className: 'as-row as-ac', style: { gap: 40 } }, h(Logo), h('nav', { className: 'as-row as-ac', style: { gap: 24 } }, links.map(function (l) { var on = l === act; return h('span', { key: l, className: 'as-navlink' }, h('span', { className: 'label-m', style: { color: on ? 'var(--ink)' : 'var(--muted)' } }, l), h('i', { style: { background: on ? 'var(--brand)' : 'transparent' } })); }))),
      p.signedIn === false ? h('div', { className: 'as-row as-ac', style: { gap: 12 } }, sw, h(Button, { variant: 'ghost' }, t.login), h(Button, { variant: 'dark' }, t.signup)) :
        h('div', { className: 'as-row as-ac', style: { gap: 12 } }, h(RoleSwitch, { active: p.role || 'Buyer', lang: lang }), sw, h('span', { style: { width: 1, height: 24, background: 'var(--line-strong)' } }), h(IconButton, { name: 'heart' }), h(IconButton, { name: 'bell' }), h(Avatar, { initials: p.initials || 'AT' })));
  }

  function StatusBar(p) {
    var c = p.dark ? '#fff' : 'var(--ink)';
    return h('div', { className: 'as-sbar', style: { color: c } }, h('span', { className: 'h5', style: { color: c } }, '9:41'),
      h('svg', { width: 68, height: 13, viewBox: '0 0 68 13', fill: 'currentColor', 'aria-hidden': true, dangerouslySetInnerHTML: { __html: '<rect x="0" y="8" width="3" height="5" rx="1"/><rect x="5" y="6" width="3" height="7" rx="1"/><rect x="10" y="3" width="3" height="10" rx="1"/><rect x="15" y="0" width="3" height="13" rx="1"/><path d="M30 4.5a9 9 0 0 1 12 0l-1.6 1.7a6.5 6.5 0 0 0-8.8 0zM33 7.7a5 5 0 0 1 6 0L36 11z"/><rect x="45.5" y=".5" width="20" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="47" y="2" width="17" height="9" rx="2"/>' } }));
  }

  function MobileHeader(p) {
    if ((p.variant || 'main') === 'main') return h('div', { className: 'as-mhead' }, h(Logo), h('span', { className: 'as-row as-ac', style: { gap: 8 } }, p.lang ? h(LanguageSwitch, { active: p.lang, lang: p.lang }) : null, h(IconButton, { name: 'bell' }), h(Avatar, { initials: p.initials || 'AT' })));
    return h('div', { className: 'as-mhead' }, h(IconButton, { name: 'arrow-left' }), h('span', { className: 'h5' }, p.title), p.action ? h(IconButton, { name: p.action }) : h('span', { style: { width: 40 } }));
  }

  var TABS_USER = [['Explore', 'home'], ['Saved', 'heart'], ['Sell', 'plus'], ['Inspections', 'shield'], ['Account', 'user']];
  var TABS_MECH = [['Queue', 'inbox'], ['Reports', 'file'], ['Workshop', 'wrench'], ['Reviews', 'star'], ['Account', 'user']];
  function TabBar(p) {
    var tabs = p.role === 'mechanic' ? TABS_MECH : TABS_USER, act = p.active || tabs[0][0], t = S(p);
    return h('nav', { className: 'as-tabbar', style: p.style }, h('div', { className: 'as-row as-ac as-sb' }, tabs.map(function (t0) {
      if (t0[0] === 'Sell') return h('span', { key: 'sell', className: 'as-sell' }, h(Icon, { name: 'plus', size: 24, color: 'on-brand' }));
      var on = t0[0] === act;
      return h('span', { key: t0[0], className: 'as-col as-ac', style: { gap: 4, width: 64 } }, h(Icon, { name: t0[1], size: 22, color: on ? 'brand' : 'muted', fill: on && t0[0] === 'Saved' ? 'brand' : null }), h('span', { className: 'label-s', style: { color: on ? 'var(--brand)' : 'var(--muted)' } }, t.tabs[t0[0]] || t0[0]));
    })), h('i', { className: 'as-homeind' }));
  }

  function Footer(p) {
    var t = S(p), lang = (p && p.lang) || 'en';
    return h('footer', { className: 'as-footer' },
      h('div', { className: 'as-row as-sb' }, h('div', { className: 'as-col', style: { gap: 16 } }, h(Logo, { tone: 'dark' }), h('p', { className: 'body-m', style: { color: 'var(--subtle)', width: 320, margin: 0 } }, t.tagline)),
        h('div', { className: 'as-row', style: { gap: 80 } }, t.footCols.map(function (c) { return h('div', { key: c[0], className: 'as-col', style: { gap: 12 } }, h('span', { className: 'overline', style: { color: 'var(--subtle)' } }, c[0]), c[1].map(function (l) { return h('span', { key: l, className: 'body-s', style: { color: 'var(--surface)' } }, l); })); }))),
      h('div', { style: { height: 1, background: 'var(--night-2)' } }),
      h('div', { className: 'as-row as-sb as-ac' }, h('span', { className: 'body-xs', style: { color: 'var(--subtle)' } }, t.legal + ' · ' + t.legalLinks),
        h('span', { className: 'as-row as-ac', style: { gap: 4 }, role: 'group', 'aria-label': t.language }, LANGS.map(function (l) { var on = l[0] === lang; return h('span', { key: l[0], lang: l[0], className: 'label-s', style: { padding: '4px 10px', borderRadius: 999, color: on ? 'var(--ink)' : 'var(--surface)', background: on ? 'var(--surface)' : 'transparent' } }, l[1]); }))));
  }

  window.AutoSouk = Object.assign(window.AutoSouk || {}, { Icon: Icon, Logo: Logo, Button: Button, Badge: Badge, Chip: Chip, EquipmentPill: EquipmentPill, EquipmentGroup: EquipmentGroup, Avatar: Avatar, Input: Input, Toggle: Toggle, Checkbox: Checkbox, Radio: Radio, Segmented: Segmented, CarPhoto: CarPhoto, Rating: Rating, SpecItem: SpecItem, ListingCard: ListingCard, MechanicCard: MechanicCard, ReviewItem: ReviewItem, StatCard: StatCard, ScoreRing: ScoreRing, ChecklistRow: ChecklistRow, InspectionTimeline: InspectionTimeline, Stepper: Stepper, UploadTile: UploadTile, MediaLimits: MediaLimits, Tabs: Tabs, Pagination: Pagination, MapView: MapView, ZelligePattern: ZelligePattern, RoleSwitch: RoleSwitch, NavDesktop: NavDesktop, MobileHeader: MobileHeader, StatusBar: StatusBar, TabBar: TabBar, Footer: Footer, IconButton: IconButton, LanguageSwitch: LanguageSwitch, I18N: I18N, ICON_NAMES: Object.keys(ICONS) });
})();
