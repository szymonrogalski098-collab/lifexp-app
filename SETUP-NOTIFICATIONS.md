# Powiadomienia push (FCM) — konfiguracja

Kod jest gotowy. Żeby push ruszył, wykonaj 3 kroki w panelach (jednorazowo).

## 1. Klucz VAPID (potrzebny w aplikacji)
1. [Firebase Console](https://console.firebase.google.com/project/faiobaj4/settings/cloudmessaging) → **Project settings → Cloud Messaging**.
2. Sekcja **Web Push certificates** → **Generate key pair**.
3. Skopiuj **Key pair** (publiczny klucz, zaczyna się od `B...`).
4. Wklej go w `app.html` w miejsce `const VAPID_KEY = 'WSTAW_VAPID_KEY';`.

> Bez tego przycisk „Włącz powiadomienia" zwróci błąd.

## 2. Service account (potrzebny dla wysyłki przez GitHub Action)
1. Firebase Console → **Project settings → Service accounts** → **Generate new private key** → pobierze się plik JSON.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
3. Nazwa: `FIREBASE_SERVICE_ACCOUNT`, wartość: **cała zawartość pliku JSON**.

## 3. Włączenie na urządzeniu
- Otwórz aplikację → **Ustawienia → Powiadomienia → Włącz powiadomienia** → zezwól.
- **iPhone/iPad:** web push działa tylko dla zainstalowanej PWA (iOS 16.4+). Najpierw „Dodaj do ekranu początkowego", potem włącz powiadomienia z poziomu zainstalowanej apki.
- Android / Chrome desktop: działa od razu po zgodzie.

## Jak to działa
- Token urządzenia zapisuje się w Firestore: `users/{uid}/fcmTokens/{token}`.
- GitHub Action `.github/workflows/notify.yml` odpala się codziennie (cron 17:00 UTC) i wywołuje `scripts/send-notifications.js`, który wysyła push na wszystkie zapisane tokeny.
- Treść/godzinę przypomnienia zmienisz w tych dwóch plikach.
- Test ręczny: zakładka **Actions → Push reminders → Run workflow**.
