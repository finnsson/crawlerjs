// **Crawler.js** is a web crawler written in JavaScript/PhantomJS.
//
// Originally developer for [pager.js](http://pagerjs.com).
//
// Source code on [GitHub](http://github.com/finnsson/crawlerjs/). MIT License.
(function () {

    // Get all arguments passed to crawler
    var args = require("system").args;

    // Set the start argument index to 1 (since 0 is the name of the file)
    var index = 1;
    // Find out if any URL pattern should be ignored while crawling the site
    var ignorePatterns = [];

    if (args[index] === '-i' || args[index] === '--ignore') {
        ignorePatterns.push(args[index + 1]);
        index += 2;
    }
    // Fetch the URL from the argument list
    var startUrl = args[index];


    // Add the start URL to the list of total URLs
    // and to the list of not yet visited pages.
    // `visitingPages` is an integer over the current number of visiting pages.
    var pages = [startUrl];
    var notVisitedPages = [startUrl];
    var visitingPages = 0;

    // `notVisitingPages` holds all URLs that are about to be visited but PhantomJS
    // hasn't loaded yet (since we don't want to load 100s of pages as the same time).
    var notVisitingPages = [];


    // If no arguments are provided: print the help information:
    //
    //     Usage: phantomjs --load-images=no crawler.js [options] url
    //
    //     Options:
    //       --ignore, -i    url pattern to ignore
    //
    //     Example:
    //       phantomjs --load-images=no
    //         crawler.js -i /some/url/\d* http://example.com/
    //
    if (startUrl === null) {
        console.log("Usage: phantomjs --load-images=no crawler.js [options] url");
        console.log("");
        console.log("Options:");
        console.log("  --ignore, -i   url pattern to ignore");
        console.log("");
        console.log("Example:");
        console.log("  phantomjs --load-images=no crawler.js -i /some/url/\d* http://example.com/ ");
        return;
    }


    // Include the file system module. We'll need it when storing files to disc later
    var fs = require("fs");
    // Include the webpage module. This module can create web pages!
    var webpage = require('webpage');

    // Load the scripts jquery ($), q (Q) and underscore (_) so we can use them
    phantom.injectJs('jquery-1.8.2.min.js');
    phantom.injectJs('q.min.js');
    phantom.injectJs('underscore-min.js');


    // ### removeA
    //
    // Helper method for removing an item from an array
    // Used like
    //
    //     removeA([1,2,4,5], 4) === [1,2,5]
    //
    function removeA(arr) {
        var what, a = arguments, L = a.length, ax;
        while (L > 1 && arr.length) {
            what = a[--L];
            while ((ax = arr.indexOf(what)) != -1) {
                arr.splice(ax, 1);
            }
        }
        return arr;
    }

    // ### encodeForBot
    //
    // Helper method for encoding characters that Google Bot (and Bing, etc) encode in the
    // fragment ID before making the ^?_escaped_fragment_=`-request.
    //
    //     & -> %26
    //
    function encodeForBot(url) {
        return url.replace(/&/g, '%26');
    }


    // ## processPage
    //
    // This method is called with a loaded page instance and the URL of
    // that page instance.
    var processPage = function (page, url) {

        // ### saveHref
        //
        // `actions` is an object with a key `saveHref`. This key/method
        // is called by the `window.callPhantom`-method inside a `page.evaluate`-
        // callback. Using `callPhantom` it is possible for PhantomJS to pass
        // serializable data out from a web page into this script.
        var actions = {
            // The `saveHref` method will analyze the href provided
            // and decide if the href is a link to a new URL that
            // should be crawled.
            saveHref:function (href) {
                // check if href contains #!/
                if (href && href.indexOf('#!/') !== -1) {
                    // check if URI is inside `startUrl`.
                    if (href.indexOf(startUrl) !== -1) {
                        // make sure URL isn't in pages-array already
                        if (!_.contains(pages, href)) {
                            // check if the URL should be ignored
                            if (! _.any(ignorePatterns, function (pattern) {
                                return href.match(pattern) != null;
                            })) {
                                // if not: add to pages-array and notVisitedPages
                                console.error("adding URL: " + href);
                                pages.push(href);
                                notVisitedPages.push(href);
                                if (visitingPages < 2) {
                                    visitingPages++;
                                    processUrl(href);
                                } else {
                                    notVisitingPages.push(href);
                                }
                            }
                        }
                    }
                }
            }
        };

        // ### page.onCallback
        // React to `window.callPhantom`. If `obj.action === 'saveHref'` the method above
        // will be executed with the data in `obj.data`.
        page.onCallback = function (obj) {
            if (obj.action) {
                actions[obj.action](obj.data);
            }
        };

        // ### page.evaluate
        //
        // Evaluate the page and run the callback in the scope of the web page.
        // Observe that the callback cannot access varialbes in this script that are outside
        // the callback! Instead the method must use `window.callPhantom` in order to send data
        // out of the callback.
        var htmlCode = page.evaluate(function () {
            var htmlTag = $('html', document);

            // * Find links
            // For each a-tag in the page, extract the href and send it to `saveHref`.
            var links = $('a', htmlTag);
            $.each(links, function (linkIndex, link) {
                var href = link.href;
                window.callPhantom({
                    action:'saveHref',
                    data:href
                });
            });


            // * Clean up currently visible HTML by removing all elements that are hidden.
            var hidden = $('body', htmlTag).find(':hidden');
            $.each(hidden, function (hiddenIndex, hiddenElement) {
                var $el = $(hiddenElement);
                if ($el.css('visibility') === 'hidden' || $el.css('display') === 'none') {
                    $el.remove();
                }
            });

            // * Remove script- and link-tags from the page.
            $('script', htmlTag).remove();
            //$('link', htmlTag).remove();

            // Return the HTML content in the cleaned up HTML site as a string
            return htmlTag[0].innerHTML
        });

        // ### Save content
        // Save polished HTML as {absolute-URL}_escaped_fragment_/hash/bang/value/index.html
        // E.g.
        //
        //    http://example.com/#!/some/cool/page
        //
        // is stored as
        //
        //    _escaped_fragment_/some/cool/page/index.html
        //

        var compactHtml = _.compact(htmlCode.split('\n')).join('\n');

        var totalFileName = page.url.substring(startUrl.length);
        var decodedParameter = totalFileName.split('#!/')[1];
        var parameter = decodedParameter ? decodedParameter : '';
        var folderName = '_escaped_fragment_' + totalFileName.split('#!/')[0];
        var totalFolderName = folderName + (parameter ? fs.separator + parameter : '');

        // create folder/tree with name `totalFolderName`
        fs.makeTree(totalFolderName);

        // create file index.html in folder with the content `compactHtml`
        fs.write(encodeForBot(totalFolderName) + fs.separator + 'index.html', compactHtml, 'w');

        removeA(notVisitedPages, url);
        visitingPages--;

        // Release the web page
        page.release();

        // Are there any pages left to visit and are less that 2 pages visited at the moment?
        if (notVisitingPages.length > 0) {
            if (visitingPages < 2) {
                var lastUrl = notVisitingPages.pop();
                visitingPages++;
                // Then visit a not yet visited page.
                processUrl(lastUrl);
            }
        }
    };

    // ## processUrl
    //
    // Process the URL provided. Start by loggins the URL to console.
    // Then create a new PhantomJS headless WebKit browser page.
    var processUrl = function (url) {
        console.log("processing url: " + url);
        var page = webpage.create();


        var pageIsOpened = $.Deferred();

        // Load the web page.
        page.open(url, function (status) {
            if (status !== 'success') {
                console.log('Unable to access network');
            } else {
                pageIsOpened.resolve(page);
            }
        });

        // Wait for 3 seconds once the page is loaded and then
        //
        // * inject jquery into the page
        // * start processing the page
        pageIsOpened.done(function (page) {
            setTimeout(function () {
                page.includeJs('http://ajax.googleapis.com/ajax/libs/jquery/1.8.2/jquery.min.js', function () {
                    processPage(page, url);
                });
            }, 3000);
        });
    };


    // ## Start
    //
    // Start processing the start URL.
    processUrl(startUrl);


    // ## Exit
    //
    // Ask every second if all pages are visited. If so: exit phantom
    setInterval(function () {
        if (notVisitedPages.length === 0) {
            phantom.exit();
        }
    }, 1000);


}());