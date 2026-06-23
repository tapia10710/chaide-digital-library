import { create } from 'zustand';
import { DocumentDef } from '../lib/mockData';
import { isStaticSite, publicAssetUrl, staticDataUrl } from '../lib/runtimeConfig';

export type UserRole = 'guest' | 'user' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
}

const USER_STORAGE_KEY = 'chaide-digital-library-user';

function staticWriteError() {
  return new Error('La administración no está disponible en la versión pública.');
}

function normalizePublicDocument(document: DocumentDef): DocumentDef {
  return {
    ...document,
    coverUrl: publicAssetUrl(document.coverUrl),
    fileUrl: publicAssetUrl(document.fileUrl),
    externalUrl: publicAssetUrl(document.externalUrl),
  };
}

function normalizePublicCategory(category: Category): Category {
  return {
    ...category,
    imageUrl: publicAssetUrl(category.imageUrl),
  };
}

function normalizePublicBanner(banner: PromotionalBannerConfig): PromotionalBannerConfig {
  return {
    ...banner,
    imageUrl: publicAssetUrl(banner.imageUrl),
    mobileImageUrl: publicAssetUrl(banner.mobileImageUrl),
  };
}

function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;

  try {
    const rawUser = window.localStorage.getItem(USER_STORAGE_KEY);
    if (!rawUser) return null;

    const parsedUser = JSON.parse(rawUser) as User;
    if (!parsedUser?.id || !parsedUser?.email || !parsedUser?.role) return null;
    return parsedUser;
  } catch {
    window.localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  imageUrl?: string;
  order?: number;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromotionalBannerConfig {
  imageUrl: string;
  /** Separate portrait image for mobile (~9:10, recommended 1700 x 1900). */
  mobileImageUrl?: string;
  mobileIsActive?: boolean;
  altText: string;
  targetUrl?: string;
  isActive: boolean;
  updatedAt?: string;
}

interface AppState {
  // Auth State
  user: User | null;
  role: UserRole;
  login: (user: User) => void;
  logout: () => void;
  
  // UI State
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
  
  previewDocId: string | null;
  setPreviewDocId: (id: string | null) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Categories
  categories: Category[];
  fetchCategories: () => Promise<void>;
  addCategory: (cat: Category) => void;
  updateCategory: (id: string, cat: Category) => Promise<void>;
  removeCategory: (id: string) => Promise<void>;

  // Promotional banner
  promotionalBanner: PromotionalBannerConfig | null;
  hasLoadedPromotionalBanner: boolean;
  fetchPromotionalBanner: () => Promise<void>;
  updatePromotionalBanner: (banner: PromotionalBannerConfig) => Promise<void>;
  uploadPromotionalBannerImage: (file: File) => Promise<string>;

  // Documents
  documents: DocumentDef[];
  isLoadingDocs: boolean;
  hasLoadedDocs: boolean;
  fetchDocuments: (isAdmin?: boolean) => Promise<void>;
  addDocument: (doc: DocumentDef) => void;
  updateDocument: (id: string, formData: FormData) => Promise<void>;
  removeDocument: (id: string) => Promise<void>;
  updateDocumentStatus: (id: string, status: 'ready' | 'processing' | 'error') => void;
}

const storedUser = getStoredUser();

export const useStore = create<AppState>((set, get) => ({
  user: storedUser,

  role: storedUser?.role || 'guest',
  login: (user) => {
    window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    set({ user, role: user.role });
  },
  logout: () => {
    window.localStorage.removeItem(USER_STORAGE_KEY);
    set({ user: null, role: 'guest' });
  },
  
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),

  previewDocId: null,
  setPreviewDocId: (id) => set({ previewDocId: id }),

  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),

  categories: [],
  fetchCategories: async () => {
    try {
      const res = await fetch(isStaticSite ? staticDataUrl('categories.json') : '/api/categories');
      if (res.ok) {
        const data = await res.json();
        set({ categories: data.map(normalizePublicCategory) });
      }
    } catch (e) {
      console.error(e);
    }
  },
  addCategory: async (cat) => {
    if (isStaticSite) throw staticWriteError();
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cat)
      });
      if (res.ok) {
        const newCat = await res.json();
        set((state) => ({ categories: [...state.categories, newCat] }));
      }
    } catch (e) {
      console.error(e);
    }
  },
  updateCategory: async (id, cat) => {
    if (isStaticSite) throw staticWriteError();
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cat)
      });
      if (res.ok) {
        const updatedCat = await res.json();
        set((state) => ({ categories: state.categories.map(c => c.id === id ? updatedCat : c) }));
      }
    } catch (e) {
      console.error(e);
    }
  },
  removeCategory: async (id) => {
    if (isStaticSite) throw staticWriteError();
    try {
      const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        set((state) => ({ categories: state.categories.filter(c => c.id !== id) }));
      }
    } catch (e) {
      console.error(e);
    }
  },

  promotionalBanner: null,
  hasLoadedPromotionalBanner: false,
  fetchPromotionalBanner: async () => {
    try {
      const res = await fetch(isStaticSite ? staticDataUrl('promotional-banner.json') : '/api/promotional-banner');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      set({ promotionalBanner: normalizePublicBanner(data), hasLoadedPromotionalBanner: true });
    } catch (e) {
      console.error(e);
      set({ hasLoadedPromotionalBanner: true });
    }
  },
  updatePromotionalBanner: async (banner) => {
    if (isStaticSite) throw staticWriteError();
    try {
      const res = await fetch('/api/promotional-banner', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(banner),
      });
      if (!res.ok) throw new Error(await res.text());
      const updatedBanner = await res.json();
      set({ promotionalBanner: updatedBanner, hasLoadedPromotionalBanner: true });
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  uploadPromotionalBannerImage: async (file) => {
    if (isStaticSite) throw staticWriteError();
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch('/api/promotional-banner/upload-image', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.imageUrl;
  },

  documents: [], // Loaded from API
  isLoadingDocs: false,
  hasLoadedDocs: false,
  fetchDocuments: async (isAdmin = false, retries = 3) => {
    if (get().isLoadingDocs) return;
    set({ isLoadingDocs: true });
    
    const apiUrl = isStaticSite
      ? staticDataUrl('documents.json')
      : `${window.location.origin}/api/documents${isAdmin ? '?admin=true' : ''}`;

    for (let i = 0; i < retries; i++) {
        try {
          console.log(`[Store] Attempt ${i + 1}: Fetching ${apiUrl}`);
          const res = await fetch(apiUrl, {
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          
          if (!res.ok) {
            const errorText = await res.text().catch(() => 'No error body');
            throw new Error(`Server returned ${res.status}: ${res.statusText}. Body: ${errorText}`);
          }
          
          const data = (await res.json()).map(normalizePublicDocument);
          console.log(`[Store] Attempt ${i + 1}: Success! Loaded ${data.length} documents.`);
          set({ documents: data, isLoadingDocs: false, hasLoadedDocs: true });

          // Aggressively preload PDFs + warm search indexes in the background so
          // catalogs open instantly once the user clicks, and search is ready
          // before they even enter the viewer. PDF loading is prioritized over
          // home-page lightness, as requested.
          if (!isAdmin && !isStaticSite) {
            import('../lib/pdfPrefetch')
              .then((m) => m.startGlobalPdfPrefetch(data))
              .catch(() => undefined);
          }
          return;
        } catch (e: any) {
          console.error(`[Store] Attempt ${i + 1} failed:`, e.name, e.message);
          if (i === retries - 1) {
            set({ isLoadingDocs: false, hasLoadedDocs: true });
          } else {
            await new Promise(resolve => setTimeout(resolve, 1500 * (i + 1)));
          }
        }
    }
  },
  
  addDocument: (doc) => set((state) => ({ documents: [doc, ...state.documents] })),
  
  updateDocument: async (id, formData) => {
    if (isStaticSite) throw staticWriteError();
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'PUT',
        body: formData
      });
      if (res.ok) {
        const updatedDoc = await res.json();
        set((state) => ({
          documents: state.documents.map(d => d.id === id ? updatedDoc : d)
        }));
      }
    } catch (e) {
      console.error(e);
      throw e;
    }
  },

  removeDocument: async (id) => {
    if (isStaticSite) throw staticWriteError();
    // Optimistic update
    const previousDocs = get().documents;
    set((state) => ({ 
      documents: state.documents.filter(d => d.id !== id) 
    }));

    try {
      console.log(`[Store] Requesting deletion of document: ${id}`);
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      
      if (!res.ok) {
        const errText = await res.text().catch(() => 'No error body');
        throw new Error(`Server failed to delete: ${res.status} ${res.statusText}. ${errText}`);
      }
      
      const data = await res.json();
      console.log(`[Store] Deletion successful for document: ${id}`, data);
    } catch (e: any) {
      console.error(`[Store] Error deleting document ${id}:`, e.message);
      alert(`No se pudo eliminar el documento: ${e.message}`);
      // Rollback
      set({ documents: previousDocs });
    }
  },
  updateDocumentStatus: (id, status) => set((state) => ({
    documents: state.documents.map(d => d.id === id ? { ...d, status } : d)
  })),
}));
