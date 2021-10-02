const express = require("express");
const cors = require("cors");
const createError = require("http-errors");
const fs = require("fs");
const path = require("path");
const execa = require("execa");

const app = express();

const isProduction = app.get("env") === "production";

if (isProduction) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");

app.set("port", process.env.PORT || 4000);

// app.use(
//   express.urlencoded({
//     extended: true,
//   })
// );
app.use(express.json());

app.use(express.static("tmp"));

// url of your client
const ALLOWED_ORIGINS = [
  "http://localhost:8080" /* "https://example-prod-app.com */,
];

app.use(
  cors({
    credentials: true, // include Access-Control-Allow-Credentials: true. remember set xhr.withCredentials = true;
    origin(origin, callback) {
      // allow requests with no origin
      // (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not " +
          "allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

app.post("/download", async (req, res) => {
  const { start, end } = req.body;

  const { stdout: url } = await execa("youtube-dl", [
    "--youtube-skip-dash-manifest",
    "--get-url",
    "--format",
    "bestaudio",
    "https://www.youtube.com/watch?v=bamxPYj0O9M",
  ]);

  console.log("url:", url);
  const haha = await execa("ffmpeg", [
    "-ss",
    new Date(start * 1000).toISOString().substr(11, 11),
    "-i",
    url,
    "-to",
    new Date(end * 1000).toISOString().substr(11, 11),
    "out.wav",
  ]);
  // console.log("url:", url);
  res.send("url");
});

const progressRegex =
  /\[download\] *(.*) of ([^ ]*)(:? *at *([^ ]*))?(:? *ETA *([^ ]*))?/;

function getDownloadEvents(stringData) {
  let outputLines = stringData.split(/\r|\n/g).filter(Boolean);
  for (let outputLine of outputLines) {
    if (outputLine[0] == "[") {
      let progressMatch = outputLine.match(progressRegex);
      if (progressMatch) {
        let progressObject = {};
        progressObject.percent = parseFloat(progressMatch[1].replace("%", ""));
        progressObject.totalSize = progressMatch[2].replace("~", "");
        progressObject.currentSpeed = progressMatch[4];
        progressObject.eta = progressMatch[6];
        console.log("progressObject:", progressObject);
        // emitter.emit("progress", progressObject);
      }
    }
  }
}

app.get("/haha", async (req, res) => {
  const subprocess = execa("youtube-dl", [
    "https://www.youtube.com/watch?v=bamxPYj0O9M",
    "--prefer-ffmpeg",
    "--extract-audio",
    "--console-title",
    "--audio-format",
    "mp3",
    "--output",
    path.join(__dirname, "tmp", "%(id)s.%(ext)s"),
  ]);

  subprocess.stdout.on("data", (data) => getDownloadEvents(data.toString()));

  (async () => {
    const { stdout } = await subprocess;
    console.log("child output:", stdout);
  })();

  // const target = path.join(__dirname, "tmp", "bamxPYj0O9M.json");

  // await execa("audiowaveform", [
  //   "-i",
  //   "tmp/bamxPYj0O9M.mp3",
  //   "-o",
  //   target,
  //   "--bits",
  //   8, // try 16
  //   "--pixels-per-second",
  //   20, // try 25
  // ]);

  // res.header("Content-Type", "application/json");
  // res.sendFile(target);
  res.sendStatus(200);
});

// central custom error handler
// NOTE: DON"T REMOVE THE 'next'!!!!!
app.use(function (err, req, res, next) {
  console.log("err:", err);
  const error = createError(500, "Something went wrong. Alerted developer");

  res.status(error.status).json(error);
});

process.on("unhandledRejection", (reason, p) => {
  console.log("reason:", reason);
  // Error not caught in promises(ie. forgot the 'catch' block) will get swallowed and disappear.
  // I just caught an unhandled promise rejection,
  // since we already have fallback handler for unhandled errors (see below),
  // let throw and let him handle that
  throw reason;
});

// mainly to catch those from third-party lib. for own code, catch it in try/catch
process.on("uncaughtException", function (err) {
  process.exit(1);
});

module.exports = app;