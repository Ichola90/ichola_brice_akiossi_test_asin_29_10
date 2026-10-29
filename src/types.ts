/**
 * Types et constantes pour la gestion des rendez-vous au guichet.
 */

export type Service = "PASSEPORT" | "CNI" | "PERMIS";

export type Statut = "confirme" | "honore" | "absent" | "annule";

export interface RendezVous {
  id: number;
  npi: string;
  service: Service | string;
  dateHeure: string | Date;
  statut: Statut | string;
  creeLe?: string | Date;
}

export interface DemandePriseRendezVous {
  npi: unknown;
  service: unknown;
  dateHeure: unknown;
}

export type ResultatRegle<T = void> =
  | { ok: true; donnees?: T }
  | { ok: false; status: 400 | 409; message: string };

export interface PageRendezVous {
  page: number;
  parPage: number;
  total: number;
  totalPages: number;
  rendezVous: RendezVous[];
}

export interface AnomalieDetection {
  champ: string;
  valeur: unknown;
  description: string;
}

/**
 * Messages d'erreur officiels au caractère près (code HTTP, texte avec ponctuation et accents).
 */
export const MESSAGES = {
  NPI_INVALIDE: "Le NPI doit comporter exactement 10 chiffres.",
  SERVICE_INCONNU: "Service inconnu : choisissez PASSEPORT, CNI ou PERMIS.",
  DATE_INVALIDE: "Date et heure invalides (format attendu : AAAA-MM-JJTHH:MM).",
  DATE_PASSEE: "Impossible de prendre un rendez-vous dans le passé.",
  FERME_WEEKEND: "Le centre est fermé le week-end.",
  HORS_GRILLE: "Créneau invalide : de 08:00 à 15:30, toutes les 30 minutes.",
  DEJA_A_VENIR: "Vous avez déjà un rendez-vous à venir.",
  CRENEAU_COMPLET: "Ce créneau est complet.",
  ANNULATION_NON_CONFIRME: "Ce rendez-vous ne peut plus être annulé.",
  ANNULATION_TARDIVE: "Annulation impossible moins de 24 h avant le rendez-vous.",
  STATUT_INCONNU: "Statut invalide : honore ou absent.",
  DEJA_CLOTURE: "Ce rendez-vous est déjà clôturé.",
} as const;

export const SERVICES_AUTORISES: ReadonlySet<string> = new Set(["PASSEPORT", "CNI", "PERMIS"]);

export const STATUTS_CLOTURE_AUTORISES: ReadonlySet<string> = new Set(["honore", "absent"]);
