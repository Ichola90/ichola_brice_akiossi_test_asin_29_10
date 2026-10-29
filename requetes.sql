-- ============================================================================
-- ÉTUDE DE CAS RECRUTEMENT ASIN (BÉNIN) - DÉVELOPPEUR TMA
-- Auteur : Ichola Brice Akiossi
-- Fichier : requetes.sql
-- Base de données : rdv_tma (PostgreSQL 14+)
-- Date pivot de l'export : '2026-11-20 18:00:00' (heure du Bénin, UTC+1)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- REQUÊTE 1 (TMA-101) : Rendez-vous 'confirme' à venir pris un week-end
-- ----------------------------------------------------------------------------
-- Description : Identifie les rendez-vous confirmés programmés un samedi ou
-- un dimanche postérieurs à la date d'export (2026-11-20 18:00:00).
-- Ces rendez-vous violent la règle "Centre ouvert du lundi au vendredi" et
-- doivent être reprogrammés en urgence avant la venue des usagers.
--
-- Équivalences syntaxiques jour de la semaine :
--   - PostgreSQL : EXTRACT(DOW FROM date_heure) IN (0, 6)   [0=Dimanche, 6=Samedi]
--   - SQLite     : strftime('%w', date_heure) IN ('0', '6')
--   - MySQL      : DAYOFWEEK(date_heure) IN (1, 7)          [1=Dimanche, 7=Samedi]

SELECT 
    id,
    npi,
    service,
    date_heure,
    statut,
    cree_le
FROM rendez_vous
WHERE statut = 'confirme'
  AND date_heure > '2026-11-20 18:00:00'
  AND EXTRACT(DOW FROM date_heure) IN (0, 6)
ORDER BY date_heure ASC;

-- Résultat attendu et vérifié : 5 lignes
--   id 680 | 0669147625 | PASSEPORT | 2026-11-21 08:30:00 (Samedi) | confirme
--   id 730 | 0679617916 | CNI       | 2026-11-28 09:00:00 (Samedi) | confirme
--   id 834 | 0610588823 | CNI       | 2026-12-05 10:00:00 (Samedi) | confirme
--   id 857 | 0671987446 | PERMIS    | 2026-12-05 10:00:00 (Samedi) | confirme
--   id 874 | 0648953073 | PASSEPORT | 2026-12-12 11:00:00 (Samedi) | confirme
--
-- Note complémentaire : 3 rendez-vous confirmés le week-end sont déjà passés
-- dans l'historique : id 475 (31/10), id 742 (14/11), id 715 (14/11).


-- ----------------------------------------------------------------------------
-- REQUÊTE 2 (TMA-102) : Créneaux en surcapacité (> 3 rendez-vous non annulés)
-- ----------------------------------------------------------------------------
-- Description : Détecte les créneaux horaires qui accueillent strictement plus
-- de 3 usagers dont le statut n'est pas 'annule' (confirme, honore, absent).
--
-- Équivalences syntaxiques agrégation d'identifiants :
--   - PostgreSQL : STRING_AGG(id::text, ', ' ORDER BY id)
--   - SQLite     : GROUP_CONCAT(id)
--   - MySQL      : GROUP_CONCAT(id ORDER BY id SEPARATOR ', ')

SELECT 
    date_heure,
    COUNT(*) AS total_inscrits,
    STRING_AGG(id::text, ', ' ORDER BY id) AS liste_ids_rdv
FROM rendez_vous
WHERE statut <> 'annule'
GROUP BY date_heure
HAVING COUNT(*) > 3
ORDER BY date_heure ASC;

-- Résultat attendu et vérifié : 3 créneaux
--   1. 2026-10-22 10:30:00 | 4 inscrits | ids: 502, 511, 517, 519 (Passé)
--   2. 2026-11-10 09:00:00 | 4 inscrits | ids: 632, 644, 681, 697 (Passé, ticket TMA-102)
--   3. 2026-11-24 14:00:00 | 4 inscrits | ids: 728, 750, 763, 783 (À VENIR - ALERTE CRITIQUE)


-- ----------------------------------------------------------------------------
-- REQUÊTE 3 (TMA-105) : Rendez-vous réactivés après annulation
-- ----------------------------------------------------------------------------
-- Description : Détecte toute transition illicite d'un rendez-vous depuis le
-- statut 'annule' vers un autre statut dans la table historique_statuts.
-- Règle violée : Les statuts 'honore', 'absent' et 'annule' sont définitifs.

SELECT 
    h.id AS historique_id,
    h.rendez_vous_id,
    r.npi,
    r.service,
    r.date_heure,
    h.ancien_statut,
    h.nouveau_statut,
    h.modifie_le,
    h.modifie_par
FROM historique_statuts h
JOIN rendez_vous r ON r.id = h.rendez_vous_id
WHERE h.ancien_statut = 'annule'
  AND h.nouveau_statut <> 'annule'
ORDER BY h.id ASC;

-- Résultat attendu et vérifié : 4 lignes
--   histo 346 | rdv 208 | 0384914669 | PASSEPORT | annule -> honore | 2026-10-07 10:20:00 | AG-01
--   histo 430 | rdv 231 | 0370202195 | PASSEPORT | annule -> honore | 2026-10-15 10:26:00 | AG-02
--   histo 547 | rdv 262 | 0317656053 | PERMIS    | annule -> absent | 2026-10-29 10:21:00 | AG-03
--   histo 676 | rdv 292 | 0330677555 | PASSEPORT | annule -> honore | 2026-11-12 10:13:00 | AG-04


-- ============================================================================
-- SECTION BONUS : REQUÊTES DE DÉTECTION DES ANOMALIES CACHÉES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BONUS 1 : NPI non conformes (longueur != 10 ou caractères non numériques)
-- ----------------------------------------------------------------------------
-- Colonne VARCHAR(20) sans contrainte CHECK ni validation applicative stricte.
-- PostgreSQL : LENGTH(npi) <> 10 OR npi !~ '^[0-9]{10}$'
-- SQLite     : LENGTH(npi) <> 10 OR npi GLOB '*[^0-9]*'

SELECT 
    id,
    npi,
    LENGTH(npi) AS longueur_npi,
    service,
    date_heure,
    statut
FROM rendez_vous
WHERE LENGTH(npi) <> 10 
   OR npi !~ '^[0-9]{10}$'
ORDER BY id ASC;

-- Résultat vérifié : 2 lignes
--   id 459 | 01234567890   (11 chiffres) | PERMIS | 2026-10-20 09:30:00 | absent
--   id 642 | 061425364711 (12 chiffres) | PERMIS | 2026-11-03 14:00:00 | honore


-- ----------------------------------------------------------------------------
-- BONUS 2 : Rendez-vous pris hors grille horaire (hors 08:00 - 15:30 ou non :00/:30)
-- ----------------------------------------------------------------------------
-- PostgreSQL : EXTRACT(HOUR ...) / TO_CHAR(date_heure, 'HH24:MI')
-- SQLite     : strftime('%H:%M', date_heure)

SELECT 
    id,
    npi,
    service,
    date_heure,
    statut
FROM rendez_vous
WHERE TO_CHAR(date_heure, 'HH24:MI') < '08:00'
   OR TO_CHAR(date_heure, 'HH24:MI') > '15:30'
   OR EXTRACT(MINUTE FROM date_heure) NOT IN (0, 30)
   OR EXTRACT(SECOND FROM date_heure) <> 0
ORDER BY date_heure ASC;

-- Résultat vérifié : 3 lignes
--   id 490 | 0004588648 | CNI       | 2026-10-27 16:00:00 (16:00 > 15:30) | honore
--   id 698 | 0051291680 | PASSEPORT | 2026-11-13 16:30:00 (16:30 > 15:30) | absent
--   id 842 | 0387129160 | PASSEPORT | 2026-12-08 16:00:00 (À VENIR !)     | confirme


-- ----------------------------------------------------------------------------
-- BONUS 3 : Rendez-vous 'confirme' passés et jamais clôturés
-- ----------------------------------------------------------------------------
-- Rendez-vous dont la date est antérieure à l'export mais restés en statut 'confirme'.

SELECT 
    id,
    npi,
    service,
    date_heure,
    statut
FROM rendez_vous
WHERE statut = 'confirme'
  AND date_heure < '2026-11-20 18:00:00'
ORDER BY date_heure ASC;

-- Résultat vérifié : 3 lignes (qui tombent en plus un samedi !)
--   id 475 | 0610057414 | PASSEPORT | 2026-10-31 09:00:00 | confirme
--   id 715 | 0600820256 | CNI       | 2026-11-14 11:30:00 | confirme
--   id 742 | 0614253647 | PASSEPORT | 2026-11-14 10:00:00 | confirme


-- ----------------------------------------------------------------------------
-- BONUS 4 : Même usager sur le même créneau pour deux services différents
-- ----------------------------------------------------------------------------

SELECT 
    r1.id AS rdv1_id,
    r2.id AS rdv2_id,
    r1.npi,
    r1.date_heure,
    r1.service AS service1,
    r2.service AS service2,
    r1.statut AS statut1,
    r2.statut AS statut2
FROM rendez_vous r1
JOIN rendez_vous r2 ON r1.npi = r2.npi 
                   AND r1.date_heure = r2.date_heure 
                   AND r1.id < r2.id;

-- Résultat vérifié : 1 cas
--   rdv 43 & 99 | NPI 0536455681 | 2026-09-01 09:30:00 | PERMIS & PASSEPORT | honore & honore


-- ----------------------------------------------------------------------------
-- BONUS 5 : Usagers ayant eu deux rendez-vous simultanément à venir lors de la création
-- ----------------------------------------------------------------------------
-- Règle métier : un usager ne peut avoir qu'un seul rendez-vous à venir.
-- Requête identifiant les cas où un 2e rendez-vous a été créé alors que le premier
-- était encore non annulé et futur par rapport à la date de création du 2e.

SELECT 
    r1.npi,
    r1.id AS rdv1_id,
    r1.service AS s1,
    r1.date_heure AS date1,
    r1.cree_le AS cree1,
    r2.id AS rdv2_id,
    r2.service AS s2,
    r2.date_heure AS date2,
    r2.cree_le AS cree2
FROM rendez_vous r1
JOIN rendez_vous r2 ON r1.npi = r2.npi AND r1.id < r2.id
WHERE r2.cree_le >= r1.cree_le
  AND r1.date_heure >= r2.cree_le
  AND r1.statut <> 'annule'
  AND r2.statut <> 'annule'
ORDER BY r1.npi, r1.id;

-- Résultat vérifié : 46 paires historiques identifiées.
