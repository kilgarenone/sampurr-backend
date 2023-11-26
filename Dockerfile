FROM --platform=linux/amd64 node:20.9.0-bookworm-slim
WORKDIR /usr/app
RUN apt update && apt -y upgrade
RUN apt install -y curl \
    python3 \
    wget \
    ffmpeg
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp
RUN wget https://github.com/bbc/audiowaveform/releases/download/1.9.1/audiowaveform_1.9.1-1-12_amd64.deb && \
    dpkg -i audiowaveform_1.9.1-1-12_amd64.deb || true && \
    apt -f install -y
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 4000
CMD [ "npm", "start"]
