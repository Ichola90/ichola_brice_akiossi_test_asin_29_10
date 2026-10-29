import {
  DateHeureBenin,
  parserDateHeureBenin,
  estWeekend,
  estCreneauGrilleValide,
} from "./temps.js";
import {
  DemandePriseRendezVous,
  RendezVous,
  ResultatRegle,
  MESSAGES,
  SERVICES_AUTORISES,
} from "./types.js";

const REGEX_NPI_STRICT = /^\d{10}$/;

/**
 * Valide une demande de prise de rendez-vous selon les règles métier de l'ASIN.
 *
 * Ordre strict des contrôles :
 * 1. NPI (exactement 10 chiffres en chaîne)
 * 2. Service (PASSEPORT, CNI, PERMIS)
 * 3. Format date/heure (AAAA-MM-JJTHH:MM et date calendrier existante)
 * 4. Date passée (< now)
 * 5. Week-end (samedi / dimanche fermé)
 * 6. Heure de la grille (08:00 à 15:30 par pas de 30 min)
 * 7. Déjà un rendez-vous à venir pour ce NPI (statut "confirme" et date >= now)
 * 8. Créneau complet (>= 3 usagers avec statut non-annulé sur le même créneau)
 *
 * @param demande Informations transmises (npi, service, dateHeure)
 * @param rendezVousExistants Liste des rendez-vous existants
 * @param now Horodatage de référence
 * @returns { ok: true } ou { ok: false, status, message }
 */
export function verifierPriseRendezVous(
  demande: DemandePriseRendezVous,
  rendezVousExistants: RendezVous[],
  now: string | Date
): ResultatRegle {
  // 1. Contrôle NPI
  if (typeof demande.npi !== "string" || !REGEX_NPI_STRICT.test(demande.npi)) {
    return { ok: false, status: 400, message: MESSAGES.NPI_INVALIDE };
  }

  // 2. Contrôle Service
  if (typeof demande.service !== "string" || !SERVICES_AUTORISES.has(demande.service)) {
    return { ok: false, status: 400, message: MESSAGES.SERVICE_INCONNU };
  }

  // 3. Contrôle format et validité calendrier de la date
  const creneau = parserDateHeureBenin(demande.dateHeure, true);
  if (!creneau) {
    return { ok: false, status: 400, message: MESSAGES.DATE_INVALIDE };
  }

  // Parse de now
  const nowBenin = parserDateHeureBenin(now, false);
  if (!nowBenin) {
    return { ok: false, status: 400, message: MESSAGES.DATE_INVALIDE };
  }

  // 4. Contrôle date passée (< now)
  if (creneau.timestampMs < nowBenin.timestampMs) {
    return { ok: false, status: 409, message: MESSAGES.DATE_PASSEE };
  }

  // 5. Contrôle week-end
  if (estWeekend(creneau)) {
    return { ok: false, status: 409, message: MESSAGES.FERME_WEEKEND };
  }

  // 6. Contrôle grille horaire
  if (!estCreneauGrilleValide(creneau)) {
    return { ok: false, status: 409, message: MESSAGES.HORS_GRILLE };
  }

  // 7. Contrôle déjà un rendez-vous à venir (statut confirme ET date_heure >= now)
  const npiDemandeur = demande.npi;
  const aDejaRdvAVenir = rendezVousExistants.some((rdv) => {
    if (rdv.npi !== npiDemandeur || rdv.statut !== "confirme") {
      return false;
    }
    const rdvDate = parserDateHeureBenin(rdv.dateHeure, false);
    if (!rdvDate) {
      return false;
    }
    return rdvDate.timestampMs >= nowBenin.timestampMs;
  });

  if (aDejaRdvAVenir) {
    return { ok: false, status: 409, message: MESSAGES.DEJA_A_VENIR };
  }

  // 8. Contrôle créneau plein (>= 3 usagers au statut non-annulé)
  let nbNonAnnulesSurCreneau = 0;
  for (const rdv of rendezVousExistants) {
    if (rdv.statut === "annule") {
      continue;
    }
    const rdvDate = parserDateHeureBenin(rdv.dateHeure, false);
    if (rdvDate && rdvDate.chaineIso === creneau.chaineIso) {
      nbNonAnnulesSurCreneau++;
      if (nbNonAnnulesSurCreneau >= 3) {
        return { ok: false, status: 409, message: MESSAGES.CRENEAU_COMPLET };
      }
    }
  }

  return { ok: true };
}
