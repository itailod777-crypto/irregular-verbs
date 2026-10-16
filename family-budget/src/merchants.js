'use strict';
// "מי זה?": זיהוי מקור החיוב לפי שם בית העסק בדף האשראי, עם קישור לאתר ולמקום שבו מבטלים.
// הרשימה מקומית ומנוהלת ידנית (בלי חיפוש ברשת), ומכסה את המנויים והחברות הנפוצים. לא מזוהה: הממשק מציע חיפוש בגוגל.
// כל קישור הוא לדומיין הרשמי של החברה. הוספת חברה: שורה אחת בטבלה למטה.
// בעברית \b לא עובד, לכן כל חלופה פשוטה נעטפת בגבולות מילה מפורשים (כך ש"פז" לא יתפוס "מפזר" ו-"ten" לא יתפוס "kitten")
const wrap = (alt) => {
  if (/^[א-ת "'\-.]+$/.test(alt)) return `(?<![א-ת])${alt}(?![א-ת])`;
  if (/^[a-z0-9 ]+$/i.test(alt)) return `(?<![a-z0-9])${alt}(?![a-z0-9])`;
  return alt;
};
const E = (re, name, what, site, cancel, how) => ({ re: new RegExp(re.includes('(') ? re : re.split('|').map(wrap).join('|'), 'i'), name, what, site, cancel: cancel || null, how: how || null });

const TABLE = [
  // סטרימינג ובידור
  E('netflix', 'Netflix', 'מנוי סטרימינג של סרטים וסדרות', 'https://www.netflix.com', 'https://www.netflix.com/cancelplan', 'בחשבון: "ביטול מנוי".'),
  E('spotify', 'Spotify', 'מנוי מוזיקה', 'https://www.spotify.com', 'https://www.spotify.com/account/subscription/', 'בעמוד החשבון: "שינוי או ביטול תוכנית".'),
  E('disney', 'Disney+', 'מנוי סטרימינג', 'https://www.disneyplus.com', 'https://www.disneyplus.com/account', 'בעמוד החשבון: "ניהול מנוי".'),
  E('hbo|max\\.com', 'HBO Max', 'מנוי סטרימינג', 'https://www.max.com', null, 'באזור החשבון באתר.'),
  E('amazon prime|primevideo|prime video', 'Amazon Prime', 'מנוי של אמזון', 'https://www.amazon.com', 'https://www.amazon.com/mc', 'ב-"Your Prime Membership".'),
  E('youtube[a-z]*', 'YouTube Premium', 'מנוי של יוטיוב', 'https://www.youtube.com', 'https://www.youtube.com/paid_memberships', 'ב-"מנויים בתשלום".'),
  E('google[ *]*(one|storage)', 'Google One', 'אחסון בענן של גוגל', 'https://one.google.com', 'https://one.google.com/settings', 'בהגדרות של Google One.'),
  E('^google|google \\*|google play', 'Google', 'חיוב של גוגל (אפליקציות, אחסון או מנוי)', 'https://payments.google.com', 'https://play.google.com/store/account/subscriptions', 'ב-Google Play: "תשלומים ומינויים".'),
  E('apple\\.com|itunes|apple services|icloud', 'Apple', 'חיוב של אפל (iCloud, אפליקציות או מנוי)', 'https://www.apple.com', 'https://support.apple.com/he-il/118428', 'בהגדרות המכשיר: שם שלכם, "מינויים".'),
  E('openai|chatgpt', 'OpenAI (ChatGPT)', 'מנוי ChatGPT', 'https://chatgpt.com', 'https://chatgpt.com/#settings/Account', 'בהגדרות: "ניהול מנוי".'),
  E('anthropic|claude\\.ai', 'Anthropic (Claude)', 'מנוי Claude', 'https://claude.ai', 'https://claude.ai/settings/billing', 'בהגדרות: "חיוב".'),
  E('microsoft|msft', 'Microsoft', 'מנוי של מיקרוסופט (Microsoft 365, Xbox ועוד)', 'https://account.microsoft.com', 'https://account.microsoft.com/services', 'בעמוד "שירותים ומינויים".'),
  E('adobe', 'Adobe', 'מנוי של אדובי', 'https://account.adobe.com', 'https://account.adobe.com/plans', 'בעמוד "תוכניות".'),
  E('canva', 'Canva', 'מנוי עיצוב', 'https://www.canva.com', 'https://www.canva.com/settings/billing-and-teams', 'בהגדרות: "חיוב וצוותים".'),
  E('dropbox', 'Dropbox', 'אחסון בענן', 'https://www.dropbox.com', 'https://www.dropbox.com/account/plan', 'בעמוד "התוכנית".'),
  E('discord', 'Discord', 'מנוי Nitro', 'https://discord.com', null, 'בהגדרות המשתמש: "מינויים".'),
  E('steam', 'Steam', 'רכישת משחקים', 'https://store.steampowered.com', null, null),
  E('playstation|sony interactive', 'PlayStation', 'מנוי או רכישה בפלייסטיישן', 'https://www.playstation.com', null, 'בהגדרות החשבון ב-PlayStation.'),
  E('nordvpn|expressvpn|protonvpn|proton', 'שירות VPN או פרוטון', 'מנוי פרטיות ואבטחה', null, null, 'באזור החשבון באתר השירות.'),
  // תקשורת
  E('פרטנר|partner', 'פרטנר', 'חברת תקשורת (סלולר, אינטרנט וטלוויזיה)', 'https://www.partner.co.il', 'https://www.partner.co.il', 'באזור האישי או במוקד השירות של החברה.'),
  E('סלקום|cellcom', 'סלקום', 'חברת תקשורת (סלולר, אינטרנט וטלוויזיה)', 'https://www.cellcom.co.il', 'https://www.cellcom.co.il', 'באזור האישי או במוקד השירות של החברה.'),
  E('פלאפון|pelephone', 'פלאפון', 'חברת סלולר', 'https://www.pelephone.co.il', 'https://www.pelephone.co.il', 'באזור האישי או במוקד השירות של החברה.'),
  E('הוט|hot mobile|hot net|hot', 'HOT', 'חברת תקשורת (כבלים, אינטרנט וסלולר)', 'https://www.hot.net.il', 'https://www.hot.net.il', 'באזור האישי או במוקד השירות של החברה.'),
  E('בזק|bezeq', 'בזק', 'אינטרנט וטלפון', 'https://www.bezeq.co.il', 'https://www.bezeq.co.il', 'באזור האישי או במוקד השירות של החברה.'),
  E('גולן טלקום|golan', 'גולן טלקום', 'חברת סלולר', 'https://www.golantelecom.co.il', 'https://www.golantelecom.co.il', 'באזור האישי או במוקד השירות של החברה.'),
  E('019|טלזר|xfone|אקספון', 'חברת תקשורת', 'חיוב של ספק תקשורת', null, null, 'באתר הספק או במוקד השירות שלו.'),
  E('yes', 'yes', 'שירותי טלוויזיה', 'https://www.yes.co.il', 'https://www.yes.co.il', 'באזור האישי או במוקד השירות של החברה.'),
  // ביטוח וקופות
  E('הראל|harel', 'הראל', 'חברת ביטוח', 'https://www.harel-group.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('הפניקס|phoenix', 'הפניקס', 'חברת ביטוח', 'https://www.fnx.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('מגדל|migdal', 'מגדל', 'חברת ביטוח', 'https://www.migdal.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('מנורה|menora', 'מנורה מבטחים', 'חברת ביטוח', 'https://www.menoramivt.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('כלל ביטוח|clal', 'כלל ביטוח', 'חברת ביטוח', 'https://www.clalbit.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('ישיר ביטוח|ביטוח ישיר', 'ביטוח ישיר', 'חברת ביטוח', 'https://www.555.co.il', null, 'באזור האישי או במוקד החברה.'),
  E('איילון|ayalon', 'איילון', 'חברת ביטוח', 'https://www.ayalon-ins.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('שירביט|shirbit', 'שירביט', 'חברת ביטוח', 'https://www.shirbit.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('הכשרה|hachshara', 'הכשרה', 'חברת ביטוח', 'https://www.hcsra.co.il', null, 'באזור האישי או מול הסוכן.'),
  E('מכבי|maccabi', 'מכבי שירותי בריאות', 'קופת חולים (ביטוח משלים או חיוב שירות)', 'https://www.maccabi4u.co.il', null, 'באזור האישי באתר או באפליקציה.'),
  E('כללית|clalit', 'כללית', 'קופת חולים (ביטוח משלים או חיוב שירות)', 'https://www.clalit.co.il', null, 'באזור האישי באתר או באפליקציה.'),
  E('מאוחדת|meuhedet', 'מאוחדת', 'קופת חולים (ביטוח משלים או חיוב שירות)', 'https://www.meuhedet.co.il', null, 'באזור האישי באתר או באפליקציה.'),
  E('לאומית|leumit', 'לאומית', 'קופת חולים (ביטוח משלים או חיוב שירות)', 'https://www.leumit.co.il', null, 'באזור האישי באתר או באפליקציה.'),
  E('ביטוח לאומי|מל\"ל', 'ביטוח לאומי', 'תשלומים לביטוח הלאומי', 'https://www.btl.gov.il', null, null),
  // בית ושירותים
  E('חברת החשמל|חשמל', 'חברת החשמל', 'חשבון חשמל', 'https://www.iec.co.il', null, null),
  E('עירית|עיריית|מועצה|ארנונה', 'הרשות המקומית', 'ארנונה, מים או אגרות עירייה', null, null, 'באתר העירייה או המועצה שלכם.'),
  E('מקורות|תאגיד מים|תאגיד המים', 'תאגיד המים', 'חשבון מים', null, null, null),
  E('פזגז|סופרגז|אמישראגז|גז', 'חברת גז', 'גז לבית', null, null, 'באזור האישי של ספק הגז.'),
  // תחבורה
  E('פנגו|pango', 'פנגו', 'חניה ותחבורה', 'https://www.pango.co.il', null, 'באפליקציה: הגדרות, "ניהול כרטיסי אשראי".'),
  E('סלופארק|cellopark', 'סלופארק', 'חניה', 'https://www.cellopark.com', null, null),
  E('דלק|פז|סונול|דור אלון|ten', 'תחנת דלק', 'דלק או חנות נוחות בתחנה', null, null, null),
  E('רב קו|רב-קו|rav kav', 'רב-קו', 'תחבורה ציבורית', 'https://www.rail.co.il', null, null),
  // מזון וקניות
  E('wolt', 'Wolt', 'משלוחי אוכל', 'https://wolt.com', null, null),
  E('תן ביס|10bis', 'תן ביס', 'משלוחי אוכל ותווי קנייה', 'https://www.10bis.co.il', null, null),
  E('סיבוס|cibus', 'סיבוס', 'תווי קנייה ועבודה', 'https://www.mysodexo.co.il', null, null),
  E('שופרסל|shufersal', 'שופרסל', 'סופרמרקט', 'https://www.shufersal.co.il', null, null),
  E('רמי לוי', 'רמי לוי', 'סופרמרקט', 'https://www.rami-levy.co.il', null, null),
  E('ויקטורי|victory', 'ויקטורי', 'סופרמרקט', 'https://www.victory.co.il', null, null),
  E('אמזון|amazon|aliexpress|temu|shein', 'קנייה ברשת', 'רכישה באתר בינלאומי', null, null, null),
  // כושר ובריאות
  E('הולמס|holmes', 'הולמס פלייס', 'מנוי חדר כושר', 'https://www.holmesplace.co.il', null, 'בדרך כלל בכתב או בסניף. כדאי לבדוק את תנאי הביטול בהסכם.'),
  E('גו אקטיב|go active|space|ספייס|fitness|פיטנס|חדר כושר', 'חדר כושר', 'מנוי חדר כושר', null, null, 'בדרך כלל בכתב או בסניף. כדאי לבדוק את תנאי הביטול בהסכם.'),
  E('סופר פארם|super pharm|סופרפארם', 'סופר-פארם', 'בית מרקחת וקוסמטיקה', 'https://www.super-pharm.co.il', null, null),
  // בנק וכרטיסים
  // בנק: החזרים קבועים
  E('למשכנת|משכנת', 'החזר משכנתא', 'תשלום חודשי על המשכנתא בבנק', null, null, 'מול הבנק שלכם: האזור האישי או הבנקאי. שינוי או מחזור מתבצעים מולו.'),
  E('פרעון הלוואה|פרעון הלואה|החזר הלוואה', 'החזר הלוואה', 'תשלום חודשי על הלוואה בבנק', null, null, 'מול הבנק שלכם: האזור האישי או הבנקאי.'),
  // כלליים
  E('מרקט|סופר |מכולת|מינימרקט', 'סופרמרקט או מכולת', 'קניות מזון', null, null, null),
  E('קפה|ארקפה|קופי|coffee|cafe', 'בית קפה', 'קפה ומאפה', null, null, null),
  E('דמי כרטיס|דמי ניהול|עמלת|עמלה|עמל\\.', 'עמלה בנקאית', 'עמלת בנק או כרטיס אשראי', null, null, 'אפשר לבקש מהבנק או מחברת האשראי להוזיל או לבטל עמלה.'),
  E('paypal', 'PayPal', 'תשלום דרך פייפל. השם האמיתי מופיע אחרי הכוכבית', 'https://www.paypal.com', 'https://www.paypal.com/myaccount/autopay/', 'ב-"תשלומים אוטומטיים".'),
];

// מנקה שם בית עסק לבדיקה: אותיות קטנות, בלי סימנים מיותרים
const clean = (s) => String(s || '').toLowerCase().replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim();

function identify(description) {
  const d = clean(description);
  if (!d) return null;
  for (const m of TABLE) if (m.re.test(d)) return { name: m.name, what: m.what, site: m.site, cancel: m.cancel, how: m.how };
  return null;
}

const searchUrl = (description) => `https://www.google.com/search?q=${encodeURIComponent(`${String(description || '').trim()} חיוב`)}`;

module.exports = { identify, searchUrl, TABLE };
