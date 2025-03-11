const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Middleware setup
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
  })
);

// Storage for file uploads
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage });

// Dummy database for users
const usersFile = "users.json";
if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, JSON.stringify([]));
}

const loadUsers = () => JSON.parse(fs.readFileSync(usersFile));
const saveUsers = (users) => fs.writeFileSync(usersFile, JSON.stringify(users));

// Store deleted files separately
const deletedFilesFile = "deletedFiles.json";
if (!fs.existsSync(deletedFilesFile)) {
  fs.writeFileSync(deletedFilesFile, JSON.stringify([]));
}

const loadDeletedFiles = () => JSON.parse(fs.readFileSync(deletedFilesFile));
const saveDeletedFiles = (files) => fs.writeFileSync(deletedFilesFile, JSON.stringify(files));

// Routes
app.get("/", (req, res) => res.redirect("/login"));

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.username === username);

  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = username;
    res.redirect("/menu");
  } else {
    res.render("login", { error: "Invalid username or password" });
  }
});

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  if (users.find((u) => u.username === username)) {
    res.render("register", { error: "Username already exists" });
    return;
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  users.push({ username, password: hashedPassword });
  saveUsers(users);

  res.redirect("/login");
});

app.get("/menu", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("menu", { user: req.session.user });
});

app.get("/upload", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.render("upload");
});

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  res.redirect("/view-files");
});

app.get("/view-files", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  fs.readdir("uploads", (err, files) => {
    if (err) files = [];
    const fileDetails = files.map((file) => ({
      name: file,
      size: (fs.statSync(path.join("uploads", file)).size / 1024).toFixed(2), // Convert to KB
    }));

    res.render("view-files", { user: req.session.user, files: fileDetails });
  });
});

app.get("/view-files", (req, res) => {
  const uploadedFiles = fs.readdirSync("uploads"); // Reads filenames from the "uploads" folder
  res.render("view-files", { files: uploadedFiles }); // Sends filenames to EJS
});

// Delete file (Moves file to deleted files storage)
app.post("/delete/:filename", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);
  const deletedFiles = loadDeletedFiles();

  if (fs.existsSync(filePath)) {
    const fileSize = (fs.statSync(filePath).size / 1024).toFixed(2);
    deletedFiles.push({ name: filename, size: fileSize });
    saveDeletedFiles(deletedFiles);

    fs.unlinkSync(filePath);
  }

  res.redirect("/view-files");
});

// Deleted Files Page
app.get("/deleted-files", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const deletedFiles = loadDeletedFiles();
  res.render("deleted-files", { deletedFiles });
});

// Restore file (Moves file back from deleted storage)
app.post("/restore/:filename", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const filename = req.params.filename;
  const deletedFiles = loadDeletedFiles();
  const fileIndex = deletedFiles.findIndex((file) => file.name === filename);

  if (fileIndex !== -1) {
    fs.writeFileSync(path.join(__dirname, "uploads", filename), ""); // Create empty file as restoration
    deletedFiles.splice(fileIndex, 1);
    saveDeletedFiles(deletedFiles);
  }

  res.redirect("/deleted-files");
});

// Permanently delete file
app.post("/delete-permanently/:filename", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const filename = req.params.filename;
  let deletedFiles = loadDeletedFiles();
  deletedFiles = deletedFiles.filter((file) => file.name !== filename);
  saveDeletedFiles(deletedFiles);

  res.redirect("/deleted-files");
});

const downloadsFilePath = "downloads.json"; // File to store downloaded file names

// Function to save downloaded file names
function saveDownloadedFile(filename) {
    let downloadedFiles = [];

    // Read existing downloads
    if (fs.existsSync(downloadsFilePath)) {
        downloadedFiles = JSON.parse(fs.readFileSync(downloadsFilePath, "utf8"));
    }

    // Avoid duplicate entries
    if (!downloadedFiles.includes(filename)) {
        downloadedFiles.push(filename);
        fs.writeFileSync(downloadsFilePath, JSON.stringify(downloadedFiles));
    }
}

// Download Route
app.get("/download/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, "uploads", filename);

    if (fs.existsSync(filePath)) {
        // Save download record
        saveDownloadedFile(filename);

        res.download(filePath);
    } else {
        res.status(404).send("File not found");
    }
});

// Retrieve Files Page (Currently empty logic, placeholder)
app.get("/retrieve-files", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  let downloadedFiles = [];

  // Read downloaded files
  if (fs.existsSync(downloadsFilePath)) {
      downloadedFiles = JSON.parse(fs.readFileSync(downloadsFilePath, "utf8"));
  }

  res.render("retrieve-files", { files: downloadedFiles });
});

app.get('/User-profile', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); // Redirect if not logged in
    }
    
    res.render('User-profile', { user: req.session.user });
});


app.get('/User-profile', (req, res) => {
  if (!req.session.user) return res.redirect('/login'); // Redirect if not logged in

  const users = loadUsers(); // Load users from JSON or storage
  const user = users.find(u => u.username === req.session.user.username); 

  if (!user) return res.redirect('/login'); // Redirect if user not found

  // Ensure file count is calculated properly
  let userFileCount = 0;
  try {
      const uploadedFiles = fs.existsSync("uploads") ? fs.readdirSync("uploads") : [];
      userFileCount = uploadedFiles.length;
  } catch (err) {
      console.error("Error reading uploads directory:", err);
  }

  // Pass user details to profile.ejs
  res.render("User-profile", {
      user: {
          username: user.username || "N/A",
          joinedDate: user.joinedDate || "Unknown",
          lastLogin: user.lastLogin || "Just now",
          fileCount: userFileCount || 0
      }
  });
});

app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = `uploads/${filename}`;  // Adjust path based on your storage folder

    res.download(filePath, (err) => {
        if (err) {
            console.error("Error downloading file:", err);
            res.status(500).send("File not found or error downloading");
        }
    });
});

app.get('/delete/:filename', (req, res) => {
    const fileName = req.params.filename;

    if (!fileName) {
        return res.status(400).send("Invalid file name");
    }

    console.log(`Deleting file: ${fileName}`);

    // TODO: Delete file from storage (add your delete logic here)

    res.send(`File "${fileName}" deleted successfully`);
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
