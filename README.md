# Module de Gestion des Rendez-vous au Guichet (ASIN Bénin)

> **Étude de cas Recrutement ASIN (Bénin) : Développeur junior Full Stack / TMA**  
> **Candidat :** Ichola Brice Akiossi (`aichola22@gmail.com`)  
> **Dépôt GitHub :** [https://github.com/Ichola90/ichola_brice_akiossi_test_asin_29_10.git](https://github.com/Ichola90/ichola_brice_akiossi_test_asin_29_10.git)  
> **Stack :** TypeScript 5.8+, Node.js 20+, Vitest, ESM pur. Zéro dépendance d'exécution (`dependencies: {}`).

---

## 1. Installation et lancement des tests

Le module est entièrement pur, découplé de tout framework ou base de données. Aucune base de données n'est requise pour exécuter l'intégralité de la suite de tests.

### Prérequis
- **Node.js** 20 ou supérieur (`node -v` >= 20.x, testé sous Node v24.13.0)
- **npm** 9 ou supérieur

### Installation
```bash
npm install
```

### Lancement des tests automatisés
```bash
# Exécution de l'ensemble des 127 tests Vitest
npm test

# Vérification stricte du typage TypeScript
npm run typecheck
```

### Vérification de l'indépendance de fuseau horaire
Toutes les règles temporelles opèrent en heure civile béninoise (UTC+1, WAT). Les 127 tests passent avec succès quel que soit le fuseau horaire de la machine :

- **Sous Linux / macOS / Bash :**
  ```bash
  TZ=America/New_York npm test
  TZ=Asia/Tokyo npm test
  TZ=UTC npm test
  ```

- **Sous Windows (PowerShell) :**
  ```powershell
  $env:TZ="America/New_York"; npm test
  $env:TZ="Asia/Tokyo"; npm test
  $env:TZ="UTC"; npm test
  ```

### Exécution des requêtes SQL d'impact
La base PostgreSQL est configurée dans pgAdmin sous le nom `rdv_tma`. Vous pouvez exécuter le fichier `requetes.sql` avec `psql` :
```bash
psql -U postgres -d rdv_tma -f requetes.sql
```
*(Le fichier `base_rendez_vous.sql` à la racine est 100% compatible PostgreSQL, SQLite et MySQL, et peut être chargé dans pgAdmin 4 via le Query Tool).*

---

## 2. Architecture du module et API

Le module est structuré sous forme de fonctions pures sans état mutable :

```
tma-rdv/
├── base_rendez_vous.sql   # Export SQL initial universel (compatible PostgreSQL, SQLite, MySQL)
├── requetes.sql           # Requêtes SQL d'impact PostgreSQL (+ équivalents SQLite/MySQL)
├── src/
│   ├── types.ts           # Types TypeScript stricts et dictionnaire MESSAGES immuable
│   ├── temps.ts           # Utilitaires de temps murale béninoise (UTC+1, parse strict/souple)
│   ├── regles.ts          # Fonctions de validation métier pures (prise, annulation, clôture, tri)
│   └── index.ts           # Point d'entrée public réexportant l'ensemble de l'API
└── tests/
    ├── temps.test.ts          # Tests unitaires du référentiel temporel béninois (11 tests)
    ├── prise_rdv.test.ts      # Tests de prise de rendez-vous (11 tests)
    ├── statuts.test.ts        # Tests d'annulation (délai 24 h) et changements de statut (7 tests)
    ├── liste_usager.test.ts   # Tests de tri ("prochain rendez-vous en tête") et pagination (4 tests)
    ├── regles.test.ts         # Rejeu fidèle des tickets TMA-101 à TMA-107 + tests de bornes (27 tests)
    ├── bonus.test.ts          # Tests des anomalies cachées détectées et outil d'audit TMA (12 tests)
    └── audit_exhaustif.test.ts # Audit strict caractère par caractère des messages et cas limites (55 tests)
```

### Signatures publiques et exemples d'utilisation

#### `verifierPriseRendezVous(demande, rendezVousExistants, now): ResultatRegle`
Vérifie la validité d'une nouvelle réservation selon l'ordre strict des 8 contrôles métier.
```typescript
import { verifierPriseRendezVous } from "./src/index.js";

const resultat = verifierPriseRendezVous(
  {
    npi: "0102030405",
    service: "PASSEPORT",
    dateHeure: "2026-11-23T08:30"
  },
  listeRendezVousExistants,
  "2026-11-20T18:00:00"
);

if (!resultat.ok) {
  console.error(`Erreur ${resultat.status} : ${resultat.message}`);
}
```

#### `verifierAnnulation(rendezVous, now): ResultatRegle`
Vérifie qu'un rendez-vous peut être annulé (statut `confirme` et délai d'au moins 24 h).
```typescript
import { verifierAnnulation } from "./src/index.js";

const resultat = verifierAnnulation(rendezVousUsager, "2026-11-17T18:00:00");
```

#### `verifierChangementStatut(rendezVous, statutDemande): ResultatRegle`
Vérifie qu'un agent peut clôturer un rendez-vous (statut demandé strictly `honore` ou `absent`, statut initial `confirme`).
```typescript
import { verifierChangementStatut } from "./src/index.js";

const resultat = verifierChangementStatut(rendezVous, "honore");
```

#### `listerRendezVousUsager(rendezVous, npi, now, page?, parPage?): PageRendezVous`
Retourne la liste paginée des rendez-vous d'un usager en plaçant le prochain rendez-vous confirmé à venir en tête absolue, suivi des autres triés par date décroissante.
```typescript
import { listerRendezVousUsager } from "./src/index.js";

const page1 = listerRendezVousUsager(
  tousLesRendezVous,
  "0203040506",
  "2026-11-20T18:00:00",
  1, // page
  10 // éléments par page
);
```

#### `auditerConformiteRendezVous(rdv): AnomalieDetection[]` *(Outil Bonus TMA)*
Inspecte un enregistrement existant en base et retourne les anomalies de structure détectées (NPI non conforme, heure hors grille, jour de week-end, statut non reconnu).

---

## 3. Hypothèses et interprétations

1. **Référentiel temporel et piège de fuseau :**
   Le Bénin applique l'heure d'Afrique de l'Ouest (WAT, UTC+1) toute l'année, sans heure d'été. Pour garantir l'absence de régression liée au fuseau horaire de la machine hôte (ex: UTC, New York, Tokyo), le parser décompose les chaînes ISO et manipule une heure murale via `Date.UTC` et les accesseurs `getUTC*`. Un objet `Date` natif JavaScript passé en paramètre est interprété comme un instant absolu et décalé de `+1 heure` pour correspondre à l'heure civile béninoise.
2. **Date de référence (`now`) :**
   Conformément aux instructions, `now` est obligatoirement fourni en paramètre aux fonctions. Aucun appel direct à `Date.now()` ou `new Date()` sans argument n'est présent dans le code métier.
3. **Égalité temporelle stricte (`creneau == now`) :**
   Si l'horodatage du créneau demandé correspond exactement à `now`, la demande est acceptée. Seule une date strictement antérieure (`creneau < now`) est considérée dans le passé (409).
4. **Calcul du délai d'annulation (24 h pile) :**
   Le délai est calculé en minutes d'heure murale (`differenceMinutes(rdv, now)`). Un délai supérieur ou égal à 1440 minutes (24 h pile) est accepté. Un délai inférieur à 1440 minutes (ex: 1439 minutes) est rejeté (409).
5. **Définition d'un rendez-vous « à venir » :**
   Un rendez-vous est qualifié « à venir » si et seulement si son statut est `confirme` **ET** sa date/heure est supérieure ou égale à `now`. Un rendez-vous antérieur à `now` resté au statut `confirme` par omission administrative ne bloque pas une nouvelle prise de rendez-vous.
6. **Tri métier et pagination :**
   Le tri métier s'effectue **avant** le découpage en pages :
   - En position 0 : le prochain rendez-vous confirmé à venir le plus proche dans le temps.
   - En positions suivantes : tous les autres rendez-vous, ordonnés par date/heure décroissante (avec départage déterministe par `id` décroissant en cas d'égalité).
7. **Règles non inventées & Questions ouvertes :**
   - *Clôture anticipée :* Les règles écrites ne précisent pas s'il est interdit d'enregistrer le statut `honore` pour un rendez-vous futur. Nous n'avons pas inventé d'interdiction dans le code, mais nous recommandons une clarification métier.
   - *Concurrence d'accès en base (Ticket TMA-102) :* Le module vérifie fidèlement la borne `>= 3`. Cependant, dans une application distribuée en production, un contrôle purement applicatif est sujet aux courses critiques (race condition). En base PostgreSQL, il est indispensable d'ajouter une transaction avec verrou `SELECT ... FOR UPDATE` sur le créneau ou une contrainte d'exclusion.

---

## 4. Tableau récapitulatif des 7 tickets

| N° Ticket | Qualification | Contexte & Données réelles | Diagnostic de la cause probable | Correction apportée | Statut du test |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TMA-101** | **ANOMALIE** | POST NPI `0614253647`, `PASSEPORT`, le `2026-11-14T10:00` accepté | Contrôle du week-end absent dans le code d'origine | Vérification du jour de semaine (`jourSemaine IN (0, 6)`) → Rejet 409 | ✅ Vert |
| **TMA-102** | **ANOMALIE** | Créneau `2026-11-10T09:00`, 3 RDV existants (632, 644, 681), 4e (697) accepté | Erreur d'opérateur (`> 3` au lieu de `>= 3`) et absence de verrouillage | Comptage des non-annulés avec borne `>= 3` → Rejet 409 | ✅ Vert |
| **TMA-103** | **ANOMALIE** | NPI `06142A3647` déclenchant une erreur HTTP 500 | Cast numérique direct ou requête SQL brute non filtrée | Regex stricte `^\d{10}$` et contrôle de type string → Rejet 400 | ✅ Vert |
| **TMA-104** | **ANOMALIE** | Le 17/11 à 18:00, annulation du RDV 709 du 19/11 à 10:00 refusée (reste 40 h) | Calcul de délai erroné (comparaison de dates partielles ou fuseaux) | Calcul exact en minutes murales `>= 1440` min → Autorisé | ✅ Vert |
| **TMA-105** | **ANOMALIE** | RDV 292 (NPI `0330677555`), statut `annule`, PATCH `honore` accepté | Absence de vérification du statut initial (statuts définitifs non protégés) | Seul `confirme` peut transiter vers `honore`/`absent` → Rejet 409 | ✅ Vert |
| **TMA-106** | **ANOMALIE** | Usager `0203040506` (13 RDV), page 1 dans le désordre, RDV 826 absent | Absence de clause `ORDER BY` ou pagination appliquée avant le tri | Tri métier complet en mémoire avant `slice()` → RDV 826 en tête | ✅ Vert |
| **TMA-107** | **CONFORME (PIÈGE)** | NPI `0102030405` a déjà le RDV 800 (`PASSEPORT`, 26/11) ; refus de `PERMIS` le 27/11 | Fonctionnement parfaitement conforme à la règle (1 seul RDV à venir) | Comportement préservé (rejet 409 "Vous avez déjà un rendez-vous à venir.") | ✅ Vert |

---

## 5. Analyse détaillée ticket par ticket

### TMA-101 : Rejet d'un créneau le week-end
- **Qualification :** **ANOMALIE**.
- **Citation de la règle :** *« Centre ouvert du lundi au vendredi, créneaux de 30 min, de 08:00 à 15:30. »*
- **Cause probable :** Le code d'origine vérifiait uniquement l'heure de la journée sans contrôler le jour calendaire de la semaine. Le 14 novembre 2026 étant un samedi, la requête n'aurait jamais dû être acceptée.
- **Correction :** Dans `src/regles.ts` (étape 5 du contrôle), la fonction `estWeekend(creneau)` identifie le samedi (`jourSemaine === 6`) et le dimanche (`jourSemaine === 0`) et renvoie un statut HTTP 409 avec le message exact : `"Le centre est fermé le week-end."`.
- **Test associé :** `tests/regles.test.ts` (suite `TMA-101 : Rejet d'un créneau le week-end (samedi 14 novembre 2026)`), rejouant la réservation du 14/11/2026 à 10:00.

### TMA-102 : Capacité maximale de 3 usagers par créneau
- **Qualification :** **ANOMALIE**.
- **Citation de la règle :** *« Un créneau accueille au plus 3 usagers (statuts non annulés : confirme, honore, absent). Un rendez-vous annulé libère sa place. »*
- **Cause probable :** Utilisation d'un opérateur strict `>` au lieu de `>=` dans la condition (`count > 3`), ou condition de concurrence (race condition) entre deux réservations simultanées.
- **Correction :** Comptabilisation stricte des rendez-vous au même créneau dont le statut est différent de `annule`. Dès que `nbNonAnnules >= 3`, la demande est refusée avec le code 409 et le message exact : `"Ce créneau est complet."`. Si l'un des trois est `annule`, la demande est acceptée.
- **Test associé :** `tests/regles.test.ts` (suite `TMA-102 : Capacité maximale de 3 usagers par créneau (2026-11-10T09:00)`), rejouant les 3 rendez-vous existants (632, 644, 681) et le refus du 4e (697).

### TMA-103 : Validation robuste du NPI
- **Qualification :** **ANOMALIE**.
- **Citation de la règle :** *« NPI : exactement 10 chiffres (chaîne, zéros initiaux conservés). »* et message attendu : `400 "Le NPI doit comporter exactement 10 chiffres."`
- **Cause probable :** Tentative de conversion en entier (ex: `parseInt` ou cast PostgreSQL `INTEGER`), provoquant un dépassement de capacité ou une exception SQL non capturée se traduisant par une erreur 500.
- **Correction :** Validation préalable par une expression régulière stricte `/^\d{10}$/` et vérification du type chaîne de caractères. Tout format erroné renvoie proprement une erreur HTTP 400 sans lever d'exception.
- **Test associé :** `tests/regles.test.ts` (suite `TMA-103 : Validation robuste du NPI (rejet 400 sans erreur interne)`), testant `"06142A3647"`, 9 chiffres, 11 chiffres, chaîne vide, espaces et types non-string.

### TMA-104 : Délai d'annulation de 24 h
- **Qualification :** **ANOMALIE**.
- **Citation de la règle :** *« Annulation par l'usager possible jusqu'à 24 h avant l'heure prévue (exactement 24 h pile = autorisé). »*
- **Cause probable :** Comparaison basée sur les seuls jours calendaires (`date_rdv - date_now`), ou comparaison des heures de la journée sans tenir compte de la date complète, ou décalage de fuseau horaire.
- **Correction :** Calcul exact de la différence en minutes entre les horodatages UTC de l'heure murale : `differenceMinutes(rdv, now) >= 1440`. À 40 h comme à 24 h pile, l'annulation est autorisée. À moins de 24 h (1439 min), elle est refusée avec le code 409 et le message exact : `"Annulation impossible moins de 24 h avant le rendez-vous."`.
- **Test associé :** `tests/regles.test.ts` (suite `TMA-104 : Délai d'annulation de 24 h (rendez-vous 709)`), testant le rendez-vous 709 à 40 h d'avance, à 24 h pile et à 23 h 59.

### TMA-105 : Protection des statuts définitifs
- **Qualification :** **ANOMALIE**.
- **Citation de la règle :** *« confirme → honore \| absent \| annule. Ces trois statuts sont définitifs. »*
- **Cause probable :** La route de mise à jour mettait à jour le statut en base sans vérifier l'état courant de l'enregistrement.
- **Correction :** Dans `verifierChangementStatut`, si `rendezVous.statut !== "confirme"`, la transition est systématiquement rejetée avec le code HTTP 409 et le message exact : `"Ce rendez-vous est déjà clôturé."`.
- **Test associé :** `tests/regles.test.ts` (suite `TMA-105 : Protection des statuts définitifs (rendez-vous 292)`), tentant de passer le rendez-vous 292 de `annule` à `honore`.

### TMA-106 : Tri métier et pagination
- **Qualification :** **ANOMALIE**.
- **Citation de la règle :** *« Liste des rendez-vous d'un usager : du plus récent au plus ancien, le prochain rendez-vous en tête, pages de 10. »*
- **Cause probable :** Application d'une clause `LIMIT 10 OFFSET 0` directement sur la table sans tri préalable, ou pagination effectuée avant la séparation du prochain rendez-vous.
- **Correction :** La fonction `listerRendezVousUsager` filtre par NPI, extrait le prochain rendez-vous confirmé à venir pour le placer à l'index 0, trie tous les autres rendez-vous par date/heure décroissante (avec départage par id décroissant), et découpe enfin en pages de 10.
- **Test associé :** `tests/regles.test.ts` (suite `TMA-106 : Tri et pagination des 13 rendez-vous de l'usager 0203040506`), rejouant les 13 rendez-vous réels de l'usager `0203040506`. Le rendez-vous 826 est bien en tête, la page 1 compte 10 éléments et la page 2 compte 3 éléments.

### TMA-107 : Unicité du rendez-vous à venir (cas conforme)
- **Qualification :** **CONFORME (PIÈGE)**.
- **Citation de la règle :** *« Un usager ne peut avoir qu'un seul rendez-vous À VENIR, tous services confondus. »*
- **Cause :** Il ne s'agit pas d'un bogue mais d'un comportement conforme aux spécifications. L'usager `0102030405` disposant déjà du rendez-vous 800 confirmé le 26/11, sa demande pour le service `PERMIS` le 27/11 devait impérativement être rejetée.
- **Correction :** Aucune modification. Le comportement a été scrupuleusement maintenu (rejet 409 `"Vous avez déjà un rendez-vous à venir."`). Un test complémentaire vérifie que les rendez-vous confirmés mais passés ne bloquent pas une nouvelle prise.
- **Test associé :** `tests/regles.test.ts` (suite `TMA-107 : Un seul rendez-vous à venir (cas conforme et piège)`).

---

## 6. Résultats réels des 3 requêtes SQL d'impact

Les requêtes ont été validées sur la base PostgreSQL `rdv_tma` (issue de l'export du 20/11/2026 à 18h00) :

### Requête 1 : Rendez-vous `confirme` à venir pris un week-end
```sql
SELECT id, npi, service, date_heure, statut
FROM rendez_vous
WHERE statut = 'confirme'
  AND date_heure > '2026-11-20 18:00:00'
  AND EXTRACT(DOW FROM date_heure) IN (0, 6)
ORDER BY date_heure ASC;
```
**Résultat réel : 5 lignes**
| id | npi | service | date_heure | statut | Jour |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **680** | 0669147625 | PASSEPORT | 2026-11-21 08:30:00 | confirme | Samedi |
| **730** | 0679617916 | CNI | 2026-11-28 09:00:00 | confirme | Samedi |
| **834** | 0610588823 | CNI | 2026-12-05 10:00:00 | confirme | Samedi |
| **857** | 0671987446 | PERMIS | 2026-12-05 10:00:00 | confirme | Samedi |
| **874** | 0648953073 | PASSEPORT | 2026-12-12 11:00:00 | confirme | Samedi |

*Remarque :* 3 autres rendez-vous confirmés le week-end sont déjà passés dans l'historique : id 475 (samedi 31/10 à 09:00), id 742 (samedi 14/11 à 10:00) et id 715 (samedi 14/11 à 11:30).

---

### Requête 2 : Créneaux avec plus de 3 rendez-vous non annulés
```sql
SELECT date_heure, COUNT(*) AS total_inscrits, STRING_AGG(id::text, ', ' ORDER BY id) AS liste_ids
FROM rendez_vous
WHERE statut <> 'annule'
GROUP BY date_heure
HAVING COUNT(*) > 3
ORDER BY date_heure ASC;
```
**Résultat réel : 3 créneaux**
| Date et heure du créneau | Inscrits | Identifiants des rendez-vous | Situation métier |
| :---: | :---: | :---: | :--- |
| **2026-10-22 10:30:00** | 4 | 502, 511, 517, 519 | Passé (honorés/absents) |
| **2026-11-10 09:00:00** | 4 | 632, 644, 681, 697 | Passé (ticket TMA-102) |
| **2026-11-24 14:00:00** | 4 | 728, 750, 763, 783 | **À VENIR - URGENCE OPÉRATIONNELLE** |

*Plan d'action TMA :* Le créneau du mardi 24 novembre 2026 à 14:00 comporte 4 rendez-vous confirmés à venir. L'équipe support doit contacter l'un des usagers (prioritairement le dernier inscrit, RDV 783 créé le 15/11) pour lui proposer une reprogrammation amiable.

---

### Requête 3 : Rendez-vous réactivés après annulation
```sql
SELECT h.id AS historique_id, h.rendez_vous_id, r.npi, r.service, h.ancien_statut, h.nouveau_statut, h.modifie_le, h.modifie_par
FROM historique_statuts h
JOIN rendez_vous r ON r.id = h.rendez_vous_id
WHERE h.ancien_statut = 'annule'
  AND h.nouveau_statut <> 'annule'
ORDER BY h.id ASC;
```
**Résultat réel : 4 lignes**
| Histo ID | RDV ID | NPI | Service | Transition | Date modification | Agent |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **346** | 208 | 0384914669 | PASSEPORT | annule → honore | 2026-10-07 10:20:00 | AG-01 |
| **430** | 231 | 0370202195 | PASSEPORT | annule → honore | 2026-10-15 10:26:00 | AG-02 |
| **547** | 262 | 0317656053 | PERMIS | annule → absent | 2026-10-29 10:21:00 | AG-03 |
| **676** | 292 | 0330677555 | PASSEPORT | annule → honore | 2026-11-12 10:13:00 | AG-04 |

*Constat :* Les 4 agents guichet (AG-01 à AG-04) ont chacun procédé à au moins une réactivation non permise par le système. Une sensibilisation sur l'irréversibilité du statut `annule` est requise.

---

## 7. Anomalies cachées détectées (Bonus)

Au-delà des tickets déclarés, un audit complet de la base a permis d'isoler 5 anomalies structurelles :

1. **NPI non conformes (longueur != 10 chiffres) :**
   - RDV 459 : NPI `'01234567890'` (11 chiffres)
   - RDV 642 : NPI `'061425364711'` (12 chiffres)
   - *Cause :* Colonne `npi VARCHAR(20)` sans contrainte `CHECK (LENGTH(npi) = 10 AND npi ~ '^[0-9]{10}$')`.
2. **Heures hors grille horaire (au-delà de 15:30) :**
   - RDV 490 : 2026-10-27 à 16:00 (honore)
   - RDV 698 : 2026-11-13 à 16:30 (absent)
   - RDV 842 : **2026-12-08 à 16:00** (statut `confirme`, **À VENIR**)
   - *Action TMA :* Le rendez-vous 842 doit être déplacé sur un créneau régulier (ex: 15:30).
3. **Rendez-vous confirmés passés non clôturés :**
   - RDV 475 (31/10/2026 09:00), RDV 715 (14/11/2026 11:30) et RDV 742 (14/11/2026 10:00).
   - Ces rendez-vous sont tous programmés un samedi et sont restés au statut `confirme`. Notre module garantit qu'ils ne bloquent pas leurs usagers respectifs.
4. **Doublon d'usager au même créneau pour deux services différents :**
   - RDV 43 (`PERMIS`) et RDV 99 (`PASSEPORT`) pris par l'usager `0536455681` le 01/09/2026 à 09:30.
   - Tous deux ont été marqués `honore`.
5. **Rendez-vous simultanément à venir dans l'historique (46 paires) :**
   - 46 usagers ont pu réserver un second rendez-vous alors que leur premier rendez-vous était encore à venir.
   - *Nuance :* Si ces données proviennent d'un jeu d'injection de test, cela démontre que le contrôle d'unicité était soit absent de l'API lors de ces insertions, soit contourné par des imports batch.
6. **Audit des annulations :**
   - Les 37 annulations enregistrées dans l'historique ont toutes été effectuées par l'acteur `'usager'`.
   - Aucune annulation tardive (< 24 h) n'a été trouvée dans l'historique existant.

---

## 8. Bilan lucide : ce qui fonctionne, ce qui manque et pourquoi

### Ce qui fonctionne parfaitement
- **Conformité stricte :** 100% des règles de gestion, codes HTTP et messages au caractère près sont respectés.
- **Indépendance environnementale :** 0 dépendance d'exécution, isolation des fuseaux horaires (résultats identiques sous UTC, New York, Tokyo).
- **Couverture de tests exhaustive :** 127 tests automatisés (Vitest) couvrant chaque ticket, les bornes limites et les cas d'anomalies de base.
- **Traçabilité SQL complète :** Requêtes PostgreSQL prêtes à l'emploi avec équivalences SQLite/MySQL documentées.

### Ce qui manque et pourquoi
1. **Couche de transport HTTP / Contrôleur REST :**
   Le sujet imposait expressément l'absence de framework (ni Next.js, ni Express) pour obtenir un module pur. En production, ce module doit être injecté comme service métier dans les contrôleurs d'API.
2. **Mécanisme de verrouillage concurrentiel :**
   En JavaScript monothread pur en mémoire, le comptage des inscrits est immédiat. En environnement distribué (plusieurs pods API accédant à PostgreSQL), deux usagers réservant simultanément la 3e place pourraient tous deux obtenir une validation. Il est impératif d'activer des transactions `SERIALIZABLE` ou d'effectuer un `SELECT COUNT(*) ... FOR UPDATE` en base.
3. **Job asynchrone de clôture automatique :**
   Les rendez-vous confirmés du passé non clôturés (ids 475, 715, 742) témoignent de l'absence d'une tâche de fond marquant automatiquement comme `absent` tout rendez-vous non honoré après la fin de la journée.
