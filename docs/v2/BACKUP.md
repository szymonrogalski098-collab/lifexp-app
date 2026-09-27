# Backup Firestore — instrukcja

Warunek wejścia do każdego etapu, który zapisuje dane (PLAN.md 5.5): istnieje świeża kopia bazy produkcyjnej
(`faiobaj4`). Tej części nie da się zautomatyzować z repo — wymaga konta Google z dostępem do projektu.

Najprościej przez **Cloud Shell** (terminal w przeglądarce, działa też na telefonie):
[console.cloud.google.com](https://console.cloud.google.com) → projekt `faiobaj4` → ikona terminala w prawym
górnym rogu. Wszystkie komendy poniżej wklejasz tam.

> Repo jest publiczne. Kopii danych nigdy nie wrzucamy do repo ani do artefaktów GitHub Actions.

---

## 1. Jednorazowo: ochrona ciągła (zalecane)

```bash
gcloud config set project faiobaj4

# Lokalizacja bazy (przyda się niżej)
gcloud firestore databases describe --database='(default)' --format='value(locationId)'

# Point-in-time recovery: możliwość odczytu stanu bazy z dowolnej minuty ostatnich 7 dni
gcloud firestore databases update --database='(default)' --enable-pitr

# Codzienny backup zarządzany przez Google, trzymany 14 dni
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d
```

Sprawdzenie:

```bash
gcloud firestore databases describe --database='(default)' --format='value(pointInTimeRecoveryEnablement)'
# oczekiwane: POINT_IN_TIME_RECOVERY_ENABLED

gcloud firestore backups schedules list --database='(default)'
# następnego dnia:
gcloud firestore backups list --format='table(name,state,snapshotTime)'
# oczekiwane: co najmniej jeden backup w stanie READY
```

Koszt przy tej wielkości bazy jest pomijalny (płaci się za przechowywanie kopii).

## 2. Przed każdym ryzykownym krokiem: eksport na żądanie

Przed etapami 3a-3f, 4, migracjami i cutoverem — eksport do prywatnego bucketu.

```bash
# jednorazowo: bucket w tej samej lokalizacji co baza (LOKALIZACJA z kroku 1)
gcloud storage buckets create gs://faiobaj4-firestore-backups --location=LOKALIZACJA --uniform-bucket-level-access

# eksport całej bazy do katalogu z datą
gcloud firestore export gs://faiobaj4-firestore-backups/$(date +%F-%H%M)
```

Sprawdzenie: `gcloud storage ls gs://faiobaj4-firestore-backups/` pokazuje nowy katalog.

Ten sam eksport posłuży w etapie 2 do inwentaryzacji i próbnych migracji na kopii w emulatorze.

## 3. Odtwarzanie (tylko w razie potrzeby)

Zasada: **nigdy nie nadpisujemy bazy produkcyjnej w ciemno.** Odtwarzamy do nowej bazy, porównujemy,
dopiero potem kopiujemy brakujące lub uszkodzone dokumenty.

```bash
# z backupu zarządzanego → nowa baza "restore-<data>"
gcloud firestore databases restore \
  --source-backup=projects/faiobaj4/locations/LOKALIZACJA/backups/ID_BACKUPU \
  --destination-database=restore-$(date +%Y%m%d)

# z eksportu → import do nowej bazy (najpierw ją utwórz)
gcloud firestore databases create --database=restore-$(date +%Y%m%d) --location=LOKALIZACJA
gcloud firestore import gs://faiobaj4-firestore-backups/KATALOG --database=restore-$(date +%Y%m%d)
```

PITR (do 7 dni wstecz) pozwala odczytać stan konkretnego dokumentu z wybranej minuty bez odtwarzania całości —
przydatne przy pojedynczym zepsutym saldzie.

## 4. Status

| Element | Stan |
|---|---|
| PITR włączony | do zrobienia (krok 1) |
| Harmonogram backupów | do zrobienia (krok 1) |
| Bucket na eksporty | do zrobienia (krok 2) |
| Ostatni eksport przed etapem z zapisami | — |
