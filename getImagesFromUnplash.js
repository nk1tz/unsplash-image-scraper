const puppeteer = require("puppeteer");
const prompt = require("prompt-async");
const fs = require("fs");
const axios = require("axios");

//   -----------------
//   USER IMPUT CONFIG
//   -----------------

var promptSchema = {
  properties: {
    search: {
      pattern: /^[a-zA-Z\s\-]+$/,
      description: "What is the search term(s)?",
      required: true
    },
    number: {
      pattern: /^(0|[1-9][0-9]*)$/,
      description: "How many results should we download?",
      required: true
    },
    folder: {
      pattern: /^[a-zA-Z\s\-]+$/,
      description: "Which folder should we save these images to?",
      required: true
    }
  }
};

const imageLibraryPath = "./unsplashimages";

// create the folder for images if it doesn't yet exist
if (!fs.existsSync(`${imageLibraryPath}`)) {
  fs.mkdirSync(`${imageLibraryPath}`);
}

//   -------------
//   MAIN FUNCTION
//   -------------

(async () => {
  console.log(
    `  
      Welcome to the Unsplash image scraper, let's get some nice images! ...
    `
  );

  await sleep(500);

  prompt.start();
  const promptResult = await prompt.get(promptSchema);
  console.log(
    `  
      Now let's go download the top ${promptResult.number} results from "${promptResult.search}" unsplash search...
    `
  );

  await sleep(1000);

  console.log(
    `  
      Obtaining results from unsplash.com/search/${slugify(promptResult.search)}
    `
  );

  const browser = await puppeteer.launch({ headless: true }); // default is true
  const page = await browser.newPage();
  await page.goto(
    `https://www.unsplash.com/search/${slugify(promptResult.search)}`,
    { waitUntil: "networkidle2" }
  );

  let imageUrls = new Array(Number(promptResult.number));

  await asyncForEach(imageUrls, async (_, i) => {
    // Select the element to begin
    let nthImageElement = (await page.$$("a[itemprop='contentUrl'] img"))[i];

    // Scroll to it
    if (nthImageElement) {
      try {
        await page.evaluate(el => {
          try {
            el.scrollIntoView();
          } catch (e) {
            console.log(e);
          }
        }, nthImageElement);
      } catch (e) {
        console.log(e);
      }

      // reselect the element now that we've scrolled to it
      nthImageElement = (await page.$$("a[itemprop='contentUrl'] img"))[i];

      // grab the imageurls from the srcset attribute of element
      const value = await (await nthImageElement.getProperty(
        "srcset"
      )).jsonValue();

      // Chop the single url and store in our global array at position i
      imageUrls[i] = value.split("?")[0];
    }
  });

  // Clean the url list in case any elements are empty
  imageUrls = imageUrls.filter(url => url);

  console.log(
    `  
      Downloading images to ${imageLibraryPath}/${promptResult.folder}/
    `
  );

  await Promise.all(downloadImagesFromUrlList(imageUrls, promptResult.folder));

  console.log(
    `
      All images downloaded
    `
  );

  await browser.close();
})();

//   ----------------
//   HELPER FUNCTIONS
//   ----------------

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

async function sleep(milliseconds) {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

function downloadImage(url, imagePath, index) {
  return axios({
    url,
    responseType: "stream"
  })
    .then(
      response =>
        new Promise((resolve, reject) => {
          response.data
            .pipe(fs.createWriteStream(imagePath))
            .on("finish", () => {
              console.log(`  image ${index} download complete  `);
              resolve();
            })
            .on("error", e => reject(e));
        })
    )
    .catch(e => console.log(e));
}

function downloadImagesFromUrlList(urlArray, folderName) {
  // create the folder for images if it doesn't yet exist
  if (!fs.existsSync(`${imageLibraryPath}/${folderName}`)) {
    fs.mkdirSync(`${imageLibraryPath}/${folderName}`);
  }

  return urlArray.map((url, index) => {
    // name should be the last part of url
    const urlSplit = url.split("/");
    const name = urlSplit[urlSplit.length - 1];

    // download this image and put in the folder
    return downloadImage(
      url,
      `${imageLibraryPath}/${folderName}/${name}.jpg`,
      index
    );
  });
}

function slugify(string) {
  const a =
    "àáäâãåăæąçćčđďèéěėëêęğǵḧìíïîįłḿǹńňñòóöôœøṕŕřßşśšșťțùúüûǘůűūųẃẍÿýźžż·/_,:;";
  const b =
    "aaaaaaaaacccddeeeeeeegghiiiiilmnnnnooooooprrsssssttuuuuuuuuuwxyyzzz------";
  const p = new RegExp(a.split("").join("|"), "g");

  return string
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
    .replace(/&/g, "-and-") // Replace & with 'and'
    .replace(/[^\w\-]+/g, "") // Remove all non-word characters
    .replace(/\-\-+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
}
