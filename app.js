import execa from "execa"
import express from "express"
import { promises as fs } from "fs"
import { nanoid } from "nanoid/async"
import path from "path"
import readline from "readline"
import { URL } from "url"
import { checkFileExists, getDownloadProgress } from "./functions.js"
import cors from "cors"

const app = express()
const isProduction = app.get("env") === "production"
// to fix 'ReferenceError: __dirname is not defined in ES module scope'
const __dirname = path.resolve()

if (isProduction) {
  app.set("trust proxy", 1)
}

app.disable("x-powered-by")

app.set("port", process.env.PORT || 4000)
app.use(cors())
app.use(express.json())

app.use(express.static("tmp"))

const tmpPath = path.join(__dirname, "/tmp")

app.get("/download", async (req, res) => {
  const { start, end, title, id } = req.query

  res.setHeader("Content-disposition", `attachment; filename=${title}.wav`)
  res.setHeader("Content-type", "audio/wav")

  const ffmpeg = execa("ffmpeg", [
    "-i",
    path.join(tmpPath, `${id}.wav`),
    "-ss",
    start,
    "-to",
    end,
    "-f",
    "wav",
    "pipe:1",
  ])

  ffmpeg.stdout.pipe(res)

  try {
    await ffmpeg
  } catch (error) {
    console.error("/download error:", error)
    res.end()
  }
})

const SOMETHING_WENT_WRONG_ERROR_TEMPLATE = (error) => `
  <p>Something went wrong</p>
  <p class="error-desc">Maybe try again</p>
  <details>
      <summary>Error details</summary>
      ${error}
  </details>
`
const FILE_TOO_BIG_ERROR_TEMPLATE = `<p>Holy shit</p><p class="error-desc">Try an upload that's less than 10 minutes long</p>`

// health check
app.get("/sup", (req, res) => {
  res.send("sup")
})

app.get("/waveform", async (req, res) => {
  let url = req.query.url

  if (!url) {
    return res.end("Invalid url")
  }

  url = decodeURIComponent(url)

  // validate url format
  try {
    new URL(url)
  } catch (err) {
    return res.end("Invalid url")
  }

  const tempId = await nanoid(5)

  let downloadAudioProcess
  let getMediaInfoProcess
  let waveformProcess
  let trackID = ""
  let tempFilePath = ""
  let filePath = ""

  req.on("aborted", function () {
    getMediaInfoProcess && getMediaInfoProcess.cancel()
    downloadAudioProcess && downloadAudioProcess.cancel()
    waveformProcess && waveformProcess.cancel()
  })

  res.writeHead(200, {
    "Content-Type": "application/json",
    "X-Accel-Buffering": "no", // this is the key for streaming response with NginX!!
  })

  getMediaInfoProcess = execa("yt-dlp", [
    url,
    "--get-title",
    "--get-thumbnail",
    "--get-duration",
    "--get-id",
    "--retries",
    1,
  ])

  try {
    const { stdout: mediaInfo } = await getMediaInfoProcess

    const [title, id, thumbnail, duration] = mediaInfo
      .split(/\r|\n/g)
      .filter(Boolean)

    // restrict media duration to less than 10 minutes
    const durationArr = duration.split(":")

    if (durationArr.length > 2 || (durationArr[1] && durationArr[0] >= 10)) {
      return res.end(
        JSON.stringify({ errorMessage: FILE_TOO_BIG_ERROR_TEMPLATE })
      )
    }

    trackID = id
    tempFilePath = path.join(__dirname, "tmp", `${trackID}_${tempId}.wav`)
    filePath = path.join(__dirname, "tmp", `${trackID}.wav`)

    res.write(JSON.stringify({ title, thumbnail, duration, id }))
  } catch (err) {
    if (!err.isCanceled) {
      return res.end(
        JSON.stringify({
          errorMessage: SOMETHING_WENT_WRONG_ERROR_TEMPLATE(err.stderr),
        })
      )
    }
    return res.end()
  }

  const isFileExists = await checkFileExists(filePath)

  try {
    if (!isFileExists) {
      downloadAudioProcess = execa("yt-dlp", [
        url,
        "--extract-audio",
        "--audio-format",
        "wav",
        "--output",
        path.join(tmpPath, `${trackID}_${tempId}.%(ext)s`),
      ])

      const rl = readline.createInterface(downloadAudioProcess.stdout)

      rl.on("line", (input) => {
        const progress = getDownloadProgress(input)
        progress && res.write(JSON.stringify(progress))
      })

      await downloadAudioProcess

      res.write(
        JSON.stringify({
          status: "Generating waveform",
          ...(isFileExists ? { percent: "95" } : {}), // keep it in quotes cuz we in FE we split by `"}`
        })
      )

      await fs.rename(tempFilePath, filePath)
    }
  } catch (err) {
    console.error("downloadAudioProcess:", err)

    if (!err.isCanceled) {
      return res.end(
        JSON.stringify({
          errorMessage: SOMETHING_WENT_WRONG_ERROR_TEMPLATE(err.stderr),
        })
      )
    }

    const files = await fs.readdir(tmpPath)

    const filesToBeDeleted = files.map((file) => {
      if (file.indexOf(`${trackID}_${tempId}`) > -1) {
        return fs.unlink(path.join(tmpPath, file))
      }
      return
    })

    await Promise.all(filesToBeDeleted)

    return res.end()
  }

  waveformProcess = execa("audiowaveform", [
    "-i",
    filePath,
    "-o",
    "-", // output to stdout
    "--bits",
    8, // try 16
    "--pixels-per-second",
    20, // try 25
    "--output-format",
    "json",
  ])

  waveformProcess.stdout.pipe(res)

  try {
    await waveformProcess
  } catch (err) {
    console.error("waveformProcess:", err)

    if (!err.isCanceled) {
      return res.end(
        JSON.stringify({
          errorMessage: SOMETHING_WENT_WRONG_ERROR_TEMPLATE(err.stderr),
        })
      )
    }

    res.end()
  }
})

process.on("unhandledRejection", (reason, p) => {
  console.error("unhandledRejection", reason)
  // Error not caught in promises(ie. forgot the 'catch' block) will get swallowed and disappear.
  // I just caught an unhandled promise rejection,
  // since we already have fallback handler for unhandled errors (see below),
  // let throw and let him handle that
  throw reason
})

// mainly to catch those from third-party lib. for own code, catch it in try/catch
process.on("uncaughtException", function (err) {
  console.error("uncaughtException:", err)
  process.exit(1)
})

export default app
