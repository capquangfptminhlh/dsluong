export function generateSchema(draft: any): Record<string, any> {
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": draft?.title || "Mock Title",
        "description": draft?.description || "Mock Description",
        "author": {
            "@type": "Person",
            "name": "AutoTax System"
        }
    };
}
