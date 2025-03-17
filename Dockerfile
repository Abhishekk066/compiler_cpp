FROM gcc:latest
WORKDIR /
COPY package*.json ./
RUN apt-get update && apt-get install -y nodejs npm
COPY . .
RUN npm install
EXPOSE 10000
CMD ["node", "index.js"]
