/** Sous-ensemble de l'API Places (New) réellement demandé par les field masks. */

export type PlaceLocation = { latitude: number; longitude: number };

/** Résultat de `places:searchText` — masque « Pro » uniquement. */
export type PlaceSearchResult = {
  id: string;
  displayName?: { text: string; languageCode?: string };
  location?: PlaceLocation;
  types?: string[];
  primaryType?: string;
  formattedAddress?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
};

export type SearchTextResponse = {
  places?: PlaceSearchResult[];
  nextPageToken?: string;
};

/** Résultat de `places/{id}` — masque « Enterprise », appelé au compte-gouttes. */
export type PlaceDetails = {
  id: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
};

export type PlacesErrorBody = {
  error?: { code?: number; message?: string; status?: string };
};
