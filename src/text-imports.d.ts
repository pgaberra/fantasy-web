// A file imported `with { loader: 'text' }` arrives as its contents. crawl-rules.spec.ts reads
// public/robots.txt and public/sitemap.xml this way to check them against the router.
declare module '*.txt' {
  const contents: string;
  export default contents;
}

declare module '*.xml' {
  const contents: string;
  export default contents;
}
