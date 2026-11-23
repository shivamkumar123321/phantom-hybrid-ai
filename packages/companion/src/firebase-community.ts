import { getAuth, signInAnonymously } from "firebase/auth";
import { addDoc, collection, getDocs, getFirestore, limit, query, where } from "firebase/firestore";
import { createRepairRecipe, filterValidRecipes, siteOrigin, type RepairRecipe } from "@phantom/shared";
import { getFirebaseApp } from "./firebase-ai";

export const RECIPE_COLLECTION = "repair_recipes";

export type CommunityStore = {
  signIn: () => Promise<string>;
  insertRecipe: (doc: RepairRecipe & { authorUid: string }) => Promise<string>;
  queryRecipes: (origin: string) => Promise<Array<{ id: string; data: unknown }>>;
};

function createFirebaseStore(): CommunityStore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  const auth = getAuth(app);
  const db = getFirestore(app);
  return {
    async signIn() {
      if (auth.currentUser) return auth.currentUser.uid;
      const credential = await signInAnonymously(auth);
      return credential.user.uid;
    },
    async insertRecipe(doc) {
      const ref = await addDoc(collection(db, RECIPE_COLLECTION), doc);
      return ref.id;
    },
    async queryRecipes(origin) {
      const snap = await getDocs(query(collection(db, RECIPE_COLLECTION), where("origin", "==", origin), limit(10)));
      return snap.docs.map((item) => ({ id: item.id, data: item.data() }));
    },
  };
}

export async function shareCommunityRecipe(
  rawRecipe: RepairRecipe,
  store: CommunityStore | null = createFirebaseStore(),
): Promise<{ ok: true; recipe: RepairRecipe } | { ok: false; error: string }> {
  const clean = createRepairRecipe(rawRecipe);
  if (!clean) return { ok: false, error: "Recipe rejected: invalid or sensitive content." };
  if (!store) return { ok: false, error: "Community sharing requires Firebase configuration." };
  try {
    const uid = await store.signIn();
    const payload = { ...clean, authorUid: uid };
    const id = await store.insertRecipe(payload);
    return { ok: true, recipe: { ...payload, id } };
  } catch {
    return { ok: false, error: "Could not share recipe to Firestore." };
  }
}

export async function fetchCommunityRecipes(
  origin: string,
  store: CommunityStore | null = createFirebaseStore(),
): Promise<{ available: boolean; recipes: RepairRecipe[] }> {
  const normalized = siteOrigin(origin);
  if (!normalized || !store) return { available: false, recipes: [] };
  try {
    await store.signIn();
    const rows = await store.queryRecipes(normalized);
    const merged = rows.map((row) => (
      typeof row.data === "object" && row.data !== null ? { ...(row.data as Record<string, unknown>), id: row.id } : row.data
    ));
    return { available: true, recipes: filterValidRecipes(merged, normalized) };
  } catch {
    return { available: false, recipes: [] };
  }
}
