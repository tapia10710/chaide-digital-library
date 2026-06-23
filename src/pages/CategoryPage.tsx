import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft } from 'lucide-react';
import PDFCard from '../components/library/PDFCard';
import { catalogCategories, documentMatchesCatalogCategory } from '../lib/catalogCategories';

export default function CategoryPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { categories, documents } = useStore();

  const editableCategory = categories.find(c => c.slug === slug);
  const staticCategory = catalogCategories.find(c => c.slug === slug);
  const category = editableCategory || (staticCategory ? {
    id: staticCategory.slug,
    name: staticCategory.label,
    slug: staticCategory.slug,
    description: staticCategory.description,
    icon: staticCategory.icon,
  } : null);
  const catalogos = documents.filter(doc =>
    doc.category === category?.name ||
    Boolean(staticCategory && documentMatchesCatalogCategory(doc, staticCategory))
  );

  if (!category) return <div className="text-[#111] p-8 font-medium">Categoría no encontrada</div>;

  return (
    <main className="min-h-screen bg-[#f5f5f2] pt-24 pb-20 px-4 md:px-8" style={{ color: '#111', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", sans-serif' }}>
      <div className="max-w-[1500px] mx-auto">
        <button 
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-[#111]/70 hover:text-[#111] transition-colors mb-12 font-medium"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver
        </button>

        <header className="mb-14">
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4" style={{ letterSpacing: '-0.055em' }}>{category.name}</h1>
          <p className="text-lg md:text-xl" style={{ color: 'rgba(0, 0, 0, 0.62)' }}>{category.description}</p>
        </header>

        {catalogos.length > 0 ? (
          <div className="category-catalog-grid">
            {catalogos.map(catalog => (
              <PDFCard key={catalog.id} doc={catalog} />
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white/50 rounded-2xl border border-black/5">
            <p style={{ color: 'rgba(0, 0, 0, 0.52)' }}>Todavía no hay catálogos en esta categoría.</p>
          </div>
        )}
      </div>
    </main>
  );
}
