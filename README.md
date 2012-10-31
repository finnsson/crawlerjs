# Crawler.js

A PhantomJS script that crawls AJAX-sites using `#!/`-syntax and generating
static HTML-sites in a `_escaped_fragment_`-directory.

## The Problem

Search bots does not implement modern HTML, CSS and JavaScript. Thus we need to give these bots a helping hand
and generate static snapshots of our sites.

## API

Run

    phantomjs --load-images=no --web-security=no crawler.js http://example.com

where `http://example.com` is your AJAX-site, or

    phantomjs --load-images=no --web-security=no crawler.js --ignore somePatters http://example.com

where `somePattern` is a RegExp pattern over the URLs that will be ignored.

## Features

Crawler.js will visit the page, wait for it to render, and then

* store the visible HTML
* find all `#!/`-links on your site
* visit every link recursively

Crawler.js will only visit the pages that are inside the page you supplied as the start argument to crawler.js.

