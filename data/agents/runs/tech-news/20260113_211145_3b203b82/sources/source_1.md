The sites robots.txt (https://lobste.rs/robots.txt), specifies that autonomous fetching of this page is not allowed, <useragent>ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)</useragent>
<url>https://lobste.rs/</url><robots>
# PR https://github.com/lobsters/lobsters to be added to the list.
User-agent: Applebot
User-agent: BingBot
User-agent: DuckDuckBot
User-agent: GoogleBot
User-agent: ia_archiver
User-agent: Kagibot
User-agent: Slurp
Allow: /
Disallow: /search
Disallow: /page/
Disallow: /comments/page/

Content-Signal: ai-input=no, ai-train=no, search=yes

User-agent: *
Crawl-delay: 1
Disallow: /

# https://lobste.rs/c/kxd3ji Please stop "respecting" robots.txt and start
# honestly following the standard.
User-agent: Brave
Disallow: /

# https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt
Sitemap: https://lobste.rs/sitemap.xml.gz

</robots>
The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.
The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI.