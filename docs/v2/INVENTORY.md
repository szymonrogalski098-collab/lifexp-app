# LifeXP — inwentaryzacja danych produkcyjnych (2026-09-27)

Źródło: workflow „Data inventory” (`scripts/inventory.js`) na commicie `ffaa0ba`, projekt `faiobaj4`,
tylko odczyt. Klasy w nawiasach ostrych są sformatowane jako kod, jak w bieżącej wersji skryptu. Raport zawiera wyłącznie schemat: wzorce ścieżek, klasy identyfikatorów, nazwy pól, typy
i liczniki. Wartości pokazane są tylko dla enumów zdefiniowanych w kodzie v1. Wnioski dla konwerterów
i migracji są naniesione na `PLAN.md` 5.3 i 5.4.

Jak czytać tabele:
- „Obecne w” — w ilu dokumentach kolekcji pole występuje. Przy polach wewnątrz tablic (`[]`) jest `—`,
  bo liczba dotyczy elementów, nie dokumentów.
- `string:empty` — pusty string; `string:date` — `YYYY-MM-DD`; `string:iso-datetime` — ISO z godziną.
- `<other>` — wartość spoza enumu z kodu (np. id własnej definicji użytkownika) albo niestandardowe id.

Ponowne uruchomienie: GitHub → Actions → „Data inventory” → Run workflow. Raport trafia do podsumowania joba
i do logu kroku „Print report”. W logu Actions znaki `{` i `}` są maskowane jako `***` (sekret to wieloliniowy
JSON, a GitHub maskuje każdą jego linię, także `{` i `}`), więc `users/***id***` w logu to `users/{id}`.

## Wnioski

1. **Skala**: 6 kont, 276 dokumentów. Pełny eksport, import do emulatora i dry-run migracji kosztują sekundy.
2. **Legacy cele nie istnieją**: 0/6 profili ma `goalName/goalType/goalAmount`, więc migracja M1 jest zbędna
   (skreślona w planie). Z 3 celów jeden nie ma `saved` → domyślnie `0`.
3. **Założenia planu potwierdzone**: `activities.timestamp` to zawsze Timestamp (37/37), `chores.monthKey`
   jest wszędzie (14/14), transakcje mają `pointsCost` i `source` (5/5), `notes`/`todos` trzymają `createdAt`
   jako ISO string, profil trzyma `createdAt` jako ISO string. `__generated__` + `typeName`: 3 aktywności.
4. **Nowe względem planu**:
   - `money/*`: legacy `pendingPoints` w 2 dokumentach (usunięte „Wypłać punkty”) — v2 ignoruje.
   - `users/{id}/aiConversations` (17): historia czatu Ex-us pisana przez backend. Klient v1 jej nie czyta,
     ale reguła `{col}/{docId}` daje do niej odczyt rodzicowi → dopisane do decyzji D7.
   - `plannerTasks` ma `dateISO` i `createdAt` (plan zakładał `day`) → poprawione w 1.5 i M5.
   - `aiTestAccces` (literówka, 1 dokument obok 2 w `aiTestAccess`): ani reguły, ani backend jej nie czytają.
   - Kwoty raz int, raz float w tym samym polu (`chorePayouts.amountPln`, `purchases.amount`,
     `pointsRateChoresZl`) — konwertery traktują je jako zwykłą liczbę.
   - Puste stringi zamiast braku wartości: `parentEmail` (5/6), `activities.desc` (33/37),
     `choreDefs.desc` (36/36), `moneyCategories.icon` (36/36).
   - `bugReports`: `createdAt` jako Timestamp, `messages[].at` jako ISO string w tym samym dokumencie.
5. **Referencje**:
   - `chores.choreId`: 2 z 14 wpisów wskazują definicję, której już nie ma (wszystkie 36 definicji to seedy,
     a te 2 id są spoza seedów). v1 zapisuje nazwę i emoji w samym wpisie, więc v2 wyświetla je z wpisu.
   - `activities.type`: 20 z 37 wskazuje id spoza seedów przy 3 własnych definicjach. Czy któreś wskazują
     skasowaną definicję, schemat nie rozstrzyga — etykieta zastępcza w konwerterze zostaje.
6. **Money**: 6 wypłat za obowiązki, ale 0 transakcji `chore_payout`; wszystkie 5 transakcji to ręczne
   przychody, wydatków nie ma wcale. Saldo nie daje się więc odtworzyć z historii transakcji — narzędzie
   „Sprawdź spójność” (5.5) pokaże różnicę i niczego nie poprawi. Ścieżka wydatku (G5.1) ma pokrycie tylko
   w testach, nie w danych.
7. **Kolekcje bez dokumentów**: `moneyLoans`, `moneyGoals`, `broadcasts` (Firestore nie zwraca pustych
   kolekcji). Konwertery pożyczek sprawdzają tylko testy na emulatorze. Skrypt raportu tygodniowego czyta
   `moneyGoals`, która jest pusta.
8. **Moduły**: `planner` jest w `enabledModules` 2 kont → migracja M3 dotyczy 2 kont; 1 konto nie ma
   `enabledModules` wcale (domyślne moduły jak w v1).
9. **Ikony w danych**: `activityDefs.icon` (29/29, Tabler `ti-*`) i `notes.icon` (8/8) zostają w bazie, v2
   ich nie renderuje (7.1). `choreDefs.emoji` (36/36) jest treścią i może być wyświetlane.

## Raport (wynik skryptu)

Wygenerowano: 2026-09-27T21:30:34.049Z · projekt: `faiobaj4` · tylko schemat, bez wartości (scripts/inventory.js).

| Kolekcja | Dokumenty | Klasy id |
|---|---:|---|
| `aiTestAccces/{id}` | 1 | `<uid-like>` ×1 |
| `aiTestAccess/{id}` | 2 | `<uid-like>` ×2 |
| `aiUsageGlobal/{id}` | 12 | `<date YYYY-MM-DD>` ×12 |
| `bugReports/{id}` | 4 | `<auto-id>` ×4 |
| `bugReportsConfig/{id}` | 1 | keywords ×1 |
| `users/{id}` | 6 | `<uid-like>` ×6 |
| `users/{id}/activities/{id}` | 37 | `<auto-id>` ×37 |
| `users/{id}/activityDefs/{id}` | 29 | learning ×6, exercise ×5, project ×5, reading ×5, school ×5, `<auto-id>` ×3 |
| `users/{id}/aiConversations/{id}` | 17 | `<auto-id>` ×17 |
| `users/{id}/choreDefs/{id}` | 36 | room_deep ×5, room_quick ×5, vacuum_ground ×5, wash_stairs ×5, dishwasher ×4, entryway ×4, trash_segregated ×4, vacuum_stairs ×4 |
| `users/{id}/chorePayouts/{id}` | 6 | `<auto-id>` ×6 |
| `users/{id}/chores/{id}` | 14 | `<auto-id>` ×14 |
| `users/{id}/dailyLog/{id}` | 29 | `<date YYYY-MM-DD>` ×29 |
| `users/{id}/fcmTokens/{id}` | 2 | `<other>` ×2 |
| `users/{id}/gamingSessions/{id}` | 7 | `<auto-id>` ×7 |
| `users/{id}/money/{id}` | 12 | balance ×6, settings ×6 |
| `users/{id}/moneyCategories/{id}` | 36 | `<auto-id>` ×36 |
| `users/{id}/moneyTransactions/{id}` | 5 | `<auto-id>` ×5 |
| `users/{id}/notes/{id}` | 8 | `<auto-id>` ×8 |
| `users/{id}/plannerTasks/{id}` | 3 | `<auto-id>` ×3 |
| `users/{id}/purchases/{id}` | 2 | `<auto-id>` ×2 |
| `users/{id}/todos/{id}` | 7 | `<auto-id>` ×7 |

### `aiTestAccces/{id}` (1)

| Pole | Obecne w | Typy |
|---|---:|---|
| `addedAt` | 1/1 | timestamp ×1 |

### `aiTestAccess/{id}` (2)

| Pole | Obecne w | Typy |
|---|---:|---|
| `addedAt` | 2/2 | timestamp ×2 |

### `aiUsageGlobal/{id}` (12)

| Pole | Obecne w | Typy |
|---|---:|---|
| `totalTokens` | 12/12 | int ×12 |

### `bugReports/{id}` (4)

| Pole | Obecne w | Typy |
|---|---:|---|
| `area` | 4/4 | string ×4 |
| `createdAt` | 4/4 | timestamp ×4 |
| `description` | 4/4 | string ×4 |
| `messages` | 4/4 | array ×4 |
| `messages[]` | — | map ×2 |
| `messages[].at` | — | string:iso-datetime ×2 |
| `messages[].isAdmin` | — | boolean ×2 |
| `messages[].text` | — | string ×2 |
| `reporterName` | 4/4 | string ×4 |
| `reporterUid` | 4/4 | string ×4 |
| `status` | 4/4 | string ×4 |
| `title` | 4/4 | string ×4 |

Wartości enumów (zdefiniowanych w kodzie):

- `area`: settings ×2, other ×1, money ×1
- `status`: new ×1, spam ×1, rejected ×1, accepted ×1

### `bugReportsConfig/{id}` (1)

| Pole | Obecne w | Typy |
|---|---:|---|
| `words` | 1/1 | array ×1 |
| `words[]` | — | string ×1 |

### `users/{id}` (6)

| Pole | Obecne w | Typy |
|---|---:|---|
| `accountMode` | 5/6 | string ×5 |
| `achievements` | 3/6 | array ×3 |
| `achievements[]` | — | string ×3 |
| `aiSettings` | 2/6 | map ×2 |
| `aiSettings.lastResetDate` | 2/6 | string:date ×2 |
| `aiSettings.tokensUsedToday` | 2/6 | int ×2 |
| `autoReport` | 2/6 | boolean ×2 |
| `createdAt` | 6/6 | string:iso-datetime ×6 |
| `dailyLimit` | 3/6 | int ×3 |
| `email` | 6/6 | string ×6 |
| `emailVerified` | 6/6 | boolean ×6 |
| `enabledModules` | 5/6 | array ×5 |
| `enabledModules[]` | — | string ×5 |
| `games` | 1/6 | array ×1 |
| `games[]` | — | string ×1 |
| `goals` | 3/6 | array ×3 |
| `goals[]` | — | map ×3 |
| `goals[].amount` | — | int ×3 |
| `goals[].celebrated` | — | boolean ×3 |
| `goals[].id` | — | string ×3 |
| `goals[].name` | — | string ×3 |
| `goals[].saved` | — | int ×2 |
| `goals[].type` | — | string ×3 |
| `lang` | 3/6 | string ×3 |
| `lastBugReportAt` | 1/6 | string:iso-datetime ×1 |
| `lastReportSent` | 2/6 | string:date ×2 |
| `moneyIncomeAllTime` | 6/6 | int ×6 |
| `name` | 6/6 | string ×6 |
| `notifHours` | 1/6 | array ×1 |
| `notifHours[]` | — | int ×1 |
| `onboardingDone` | 5/6 | boolean ×5 |
| `parentEmail` | 6/6 | string:empty ×5, string ×1 |
| `parentEmailVerifiedAt` | 1/6 | string:iso-datetime ×1 |
| `pcBuild` | 3/6 | map ×3 |
| `pcBuild.componentOrder` | 3/6 | array ×3 |
| `pcBuild.componentOrder[]` | — | string ×3 |
| `pcBuild.currentComponentIndex` | 3/6 | int ×3 |
| `pcBuild.progress` | 3/6 | map ×3 |
| `pcBuild.progress.case` | 3/6 | int ×3 |
| `pcBuild.progress.cpu` | 3/6 | int ×3 |
| `pcBuild.progress.gpu` | 3/6 | int ×3 |
| `pcBuild.progress.motherboard` | 3/6 | int ×3 |
| `pcBuild.progress.psu` | 3/6 | int ×3 |
| `pcBuild.progress.ram` | 3/6 | int ×3 |
| `points` | 6/6 | map ×6 |
| `points.earnedAllTime` | 6/6 | int ×6 |
| `points.spentAllTime` | 6/6 | int ×6 |
| `points.total` | 6/6 | int ×6 |
| `pointsRateChoresPts` | 3/6 | int ×3 |
| `pointsRateChoresZl` | 3/6 | float ×2, int ×1 |
| `pointsRateGeneralPts` | 2/6 | int ×2 |
| `pointsRateGeneralZl` | 2/6 | int ×2 |
| `streakFreezeLastUsed` | 2/6 | string:date ×2 |

Wartości enumów (zdefiniowanych w kodzie):

- `accountMode`: solo ×5
- `enabledModules[]`: chores ×5, notes ×5, stats ×5, aichat ×5, games ×4, money ×4, planner ×2
- `goals[].type`: money ×3
- `lang`: pl ×2, en ×1

### `users/{id}/activities/{id}` (37)

| Pole | Obecne w | Typy |
|---|---:|---|
| `desc` | 37/37 | string:empty ×33, string ×4 |
| `duration` | 37/37 | int ×37 |
| `points` | 37/37 | int ×37 |
| `timestamp` | 37/37 | timestamp ×37 |
| `type` | 37/37 | string ×37 |
| `typeName` | 3/37 | string ×3 |

Wartości enumów (zdefiniowanych w kodzie):

- `type`: `<other>` ×20, project ×11, `__generated__` ×3, learning ×2, exercise ×1

### `users/{id}/activityDefs/{id}` (29)

| Pole | Obecne w | Typy |
|---|---:|---|
| `color` | 29/29 | string ×29 |
| `icon` | 29/29 | string ×29 |
| `name` | 29/29 | string ×29 |
| `order` | 29/29 | int ×29 |
| `points` | 29/29 | int ×29 |

### `users/{id}/aiConversations/{id}` (17)

| Pole | Obecne w | Typy |
|---|---:|---|
| `messages` | 17/17 | array ×17 |
| `messages[]` | — | map ×17 |
| `messages[].role` | — | string ×17 |
| `messages[].text` | — | string ×17 |
| `updatedAt` | 17/17 | timestamp ×17 |

### `users/{id}/choreDefs/{id}` (36)

| Pole | Obecne w | Typy |
|---|---:|---|
| `desc` | 36/36 | string:empty ×36 |
| `emoji` | 36/36 | string ×36 |
| `name` | 36/36 | string ×36 |
| `oneTime` | 36/36 | boolean ×36 |
| `order` | 36/36 | int ×36 |
| `points` | 36/36 | int ×36 |

### `users/{id}/chorePayouts/{id}` (6)

| Pole | Obecne w | Typy |
|---|---:|---|
| `amountPln` | 6/6 | float ×4, int ×2 |
| `createdAt` | 6/6 | timestamp ×6 |
| `fromISO` | 6/6 | string:date ×6 |
| `points` | 6/6 | int ×6 |
| `toISO` | 6/6 | string:date ×6 |

### `users/{id}/chores/{id}` (14)

| Pole | Obecne w | Typy |
|---|---:|---|
| `choreEmoji` | 14/14 | string ×14 |
| `choreId` | 14/14 | string ×14 |
| `choreName` | 14/14 | string ×14 |
| `createdAt` | 14/14 | timestamp ×14 |
| `dateISO` | 14/14 | string:date ×14 |
| `monthKey` | 14/14 | string:month ×14 |
| `points` | 14/14 | int ×14 |

Wartości enumów (zdefiniowanych w kodzie):

- `choreId`: room_deep ×7, vacuum_ground ×2, vacuum_stairs ×2, `<other>` ×2, trash_segregated ×1

### `users/{id}/dailyLog/{id}` (29)

| Pole | Obecne w | Typy |
|---|---:|---|
| `gamingMinutes` | 29/29 | int ×29 |
| `pointsEarned` | 29/29 | int ×29 |

### `users/{id}/fcmTokens/{id}` (2)

| Pole | Obecne w | Typy |
|---|---:|---|
| `createdAt` | 2/2 | timestamp ×2 |
| `token` | 2/2 | string ×2 |
| `ua` | 2/2 | string ×2 |

### `users/{id}/gamingSessions/{id}` (7)

| Pole | Obecne w | Typy |
|---|---:|---|
| `date` | 7/7 | string:date ×7 |
| `duration` | 7/7 | int ×7 |
| `game` | 7/7 | string ×7 |
| `timestamp` | 7/7 | timestamp ×7 |

### `users/{id}/money/{id}` (12)

| Pole | Obecne w | Typy |
|---|---:|---|
| `currency` | 6/12 | string ×6 |
| `current` | 6/12 | int ×6 |
| `monthlyLimit` | 6/12 | int ×6 |
| `pendingPoints` | 2/12 | int ×2 |

### `users/{id}/moneyCategories/{id}` (36)

| Pole | Obecne w | Typy |
|---|---:|---|
| `color` | 36/36 | string ×36 |
| `icon` | 36/36 | string:empty ×36 |
| `name` | 36/36 | string ×36 |

### `users/{id}/moneyTransactions/{id}` (5)

| Pole | Obecne w | Typy |
|---|---:|---|
| `amount` | 5/5 | int ×5 |
| `category` | 5/5 | string ×5 |
| `createdAt` | 5/5 | timestamp ×5 |
| `date` | 5/5 | string:date ×5 |
| `note` | 5/5 | string ×5 |
| `pointsCost` | 5/5 | int ×5 |
| `source` | 5/5 | string ×5 |
| `type` | 5/5 | string ×5 |

Wartości enumów (zdefiniowanych w kodzie):

- `source`: manual ×5
- `type`: income ×5

### `users/{id}/notes/{id}` (8)

| Pole | Obecne w | Typy |
|---|---:|---|
| `archived` | 8/8 | boolean ×8 |
| `color` | 8/8 | string ×7, string:empty ×1 |
| `content` | 8/8 | string ×8 |
| `createdAt` | 8/8 | string:iso-datetime ×8 |
| `icon` | 8/8 | string ×7, string:empty ×1 |
| `title` | 8/8 | string ×8 |

### `users/{id}/plannerTasks/{id}` (3)

| Pole | Obecne w | Typy |
|---|---:|---|
| `activityId` | 3/3 | null ×3 |
| `createdAt` | 3/3 | timestamp ×3 |
| `dateISO` | 3/3 | string:date ×3 |
| `done` | 3/3 | boolean ×3 |
| `durationMin` | 3/3 | int ×3 |
| `points` | 3/3 | int ×3 |
| `time` | 3/3 | string ×3 |
| `title` | 3/3 | string ×3 |
| `type` | 3/3 | string ×3 |

### `users/{id}/purchases/{id}` (2)

| Pole | Obecne w | Typy |
|---|---:|---|
| `amount` | 2/2 | int ×1, float ×1 |
| `description` | 2/2 | string ×2 |
| `pointsCost` | 2/2 | int ×2 |
| `timestamp` | 2/2 | timestamp ×2 |

### `users/{id}/todos/{id}` (7)

| Pole | Obecne w | Typy |
|---|---:|---|
| `createdAt` | 7/7 | string:iso-datetime ×7 |
| `done` | 7/7 | boolean ×7 |
| `dueDate` | 7/7 | string:date ×7 |
| `penaltyApplied` | 7/7 | boolean ×7 |
| `size` | 7/7 | string ×7 |
| `text` | 7/7 | string ×7 |

Wartości enumów (zdefiniowanych w kodzie):

- `size`: S ×4, L ×3
