require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Scan = require("../models/scanModel");
const OpenAI = require("openai");
const BuildingScan = require("../models/buildingScanModel");
const MaterialScan = require("../models/MaterialScan");
const axios = require("axios");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 99000,
});

function cleanJsonString(inputString) {
  try {
    // First, try to find and parse a JSON array
    let jsonMatch = inputString.match(/\[\s*{.*}\s*\]/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no array found, try to find and parse a JSON object
    jsonMatch = inputString.match(/\{\s*".*"\s*:.+\}/s);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If still no match, try to extract JSON by looking for common patterns
    const possibleJson = inputString
      .replace(/^[\s\S]*?(\[|\{)/, "$1")
      .replace(/(\]|\})[\s\S]*$/, "$1");

    // Try parsing the extracted content
    return JSON.parse(possibleJson);
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return null;
  }
}

const classifyImageType = async (imageUrl) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an image classifier for construction sites.

Your task is to  strictly classify the uploaded image into one of the following categories based on its content:

There are only 4 valid classifications:

- "tool" → if the image contains only construction tools or equipment (e.g., hammer drill, excavator, laser level).
- "building" →  If the image shows a building or structure (e.g., residential, institutional, high-rise, mixed-use).
- "material" → If the image contains building materials (e.g., gypsum board, rebar, TPO membrane, Type N mortar).
- "both" → If the image contains both construction tools/equipment and buildings/structures in the same frame.
- "none" → If the image does not clearly fit into any of the above categories.

Reply strictly with one word: "tool", "building", "material", or "both" or "none".

No explanations. No extra text. No commentary.`,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    });

    const classification = response.choices[0].message.content
      .trim()
      .toLowerCase();
    return classification;
  } catch (error) {
    console.error("Error classifying image type:", error);
    return "tool"; // fallback
  }
};

const generateToolAnalysisFromImage = async (imageUrl) => {
  console.log({ imageUrl });
  try {
    return await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You are a certified Construction Tool Expert and OSHA/NIOSH-certified Safety Trainer. Your task is to analyze the uploaded construction tool image and provide professional information about the specific tool shown.

📂 Output Format
Please return your response in structured JSON as follows:

✅ Tasks Overview
1. 🔎 Detect & Identify All Tools
Detect all tools in the image — including:
Partially visible or overlapping tools

📂 Output Format

Return your response in structured JSON as follows:

{
   "found":  "string",  // This should dynamically represent how many tools were detected in total
  "toolsDetected": [
    {
      "detailedView": {
        "image": "string",
        "toolName": "string",                      //  What was scanned (e.g., "Cordless Drill")
        "category": "string",                      //  Choose from: Power Tool, Hand Tool, Measurement Tool, Heavy Equipment, Safety Equipment, Concrete Tool Or another relevant category
        "description": "string",                    // Detailed Description of the tool
        "primaryUses": ["string", "..."],          //  What it's commonly used for in complete detailed description in step by step i.e (1, 2, 3)
        "skillLevel": "string",                    //  Beginner / Intermediate / Expert with reson in complete detailed long
        "manufacturers": ["string", "..."]         //  Brands that make this tool with detailed 
        "safetyGuidelines": "string",              //  OSHA/NIOSH-compliant guidance (PPE, handling) in detailed description in step by step (1,2,3)
      },
    }
  ]
}

\`\`\`
🔍 Instructions for Tool Image Analysis
Carefully analyze the uploaded image and return a structured JSON response by following the guidelines below:

🔎 Detection & Identification
Detect all visible tools in the image — including:

Partially obscured or overlapping items

Attached accessories or tool variants

Multiple tools of the same category (e.g., drills from different brands)

Count the total number of tools detected in the image, and include this count in the found field at the top level of the JSON response. For example, if 3 tools are detected, the found field should be 3. Ensure this total count is correct and represents the number of tools detected across all entries

Use precise professional names for each tool (e.g., “Cordless SDS-Plus Rotary Hammer Drill”).
`,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 2000,
    });
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    throw new Error("Failed to analyze image with OpenAI");
  }
};

const generateMaterialAnalysisFromImage = async (imageUrl) => {
  console.log({ imageUrl });
  try {
    return await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You are an expert in construction materials analysis with deep knowledge of building systems, specification standards, environmental certifications (LEED, WELL), and safe installation practices. Your task is to examine the image of a construction site or material sample and return a **structured JSON array** describing **each identifiable material**.

Each object must reflect accurate trade terminology and include reliable, spec-grade information. The goal is to support estimators, apprentices, engineers, and procurement teams with clear, actionable intelligence.

Return a JSON array where each material includes the following fields:

\`\`\`json
[
  {
    "materialName": "string",                // Common trade name (e.g., Type X Drywall, PVC Pipe, R-19 Batt Insulation)

    "materialCategory": "string",            // System classification: Framing, Finish, Piping, Cladding, Insulation, Roofing

    "materialDescription": "string",         // Detailed explanation of the material, its properties, and appearance

    "applications": ["string", ...],         // Provide a detailed list of applications for the specified material or component. Each application should include a complete detailed description of its purpose,also give minimum 3 applications and Use the following format:
                                             // [Application Name]: [Brief description of the application’s purpose].
                                             // For Example:
                                             // 1. Wall Sheathing: Provides structural support and a nailing base for siding.
                                             // 2. Roof Decking: Serves as a base for roofing materials like shingles.
                                             // 3. Subflooring: Acts as a foundation beneath finish flooring materials.
                                             // 4. Furniture and Interior Use: Utilized in furniture manufacturing and interior applications.

    "handlingNotes": ["string", ...],        // Provide detailed handling notes for the specified material or component. The handling notes should include the following aspects:
                                             // Installation Hazards: Describe any risks or safety concerns that may arise during installation. Include required personal protective equipment (PPE), risks associated with cutting, lifting, or fastening, and recommendations for safe installation practices.
                                             // Moisture Tolerance: Explain the material's resistance or sensitivity to moisture. Include information on whether the material can withstand high humidity or water exposure, and how moisture may affect its performance, durability, or structural integrity.
                                             // Storage Tips: Offer practical guidelines for storing the material to maintain its quality. Specify ideal environmental conditions (e.g., dry, shaded, or temperature-controlled areas), whether the material should be kept off the ground, and precautions like avoiding freezing or direct sunlight.
                                             // Example:
                                             // 1. Installation Hazards: Use gloves and eye protection during cutting and fastening. Avoid inhaling dust during installation; wear a dust mask or respirator if sawing indoors. Ensure materials are adequately supported to prevent dropping or injury.
                                             // 2. Moisture Tolerance: Moderately moisture-tolerant but should not be exposed to prolonged water contact. Can withstand short-term humidity but may swell or degrade over time if consistently damp.
                                             // 3. Storage Tips: Store indoors or under a waterproof cover in a well-ventilated area. Keep the material elevated off concrete or soil to prevent moisture absorption. Avoid freezing conditions that could cause cracking or brittleness.

    "environmentalImpact": ["string", ...],  // Provide comprehensive environmental impact information for the specified material or component. Address the following aspects in detail:
                                             // Sustainable Material: Explain in detail how the material supports environmental sustainability. Include information such as the use of renewable or fast-growing resources (e.g., small-diameter trees), reduced reliance on old-growth timber, and efficient manufacturing practices.
                                             // Low Formaldehyde Emissions: Indicate whether the material uses low-emitting adhesives or resins. Specify compliance with relevant health and safety standards (e.g., CARB Phase 2, EPA TSCA Title VI) to ensure minimal off-gassing. give in detail
                                             // VOC Levels: Provide information in detail about the material’s volatile organic compound (VOC) emissions. Indicate if it qualifies as low-VOC or no-VOC and cite any applicable certifications (e.g., GREENGUARD, FloorScore).
                                             // Recyclability: Describe the material's potential in detail for recycling or reuse. If recycling is limited, mention alternative end-of-life options such as energy recovery through incineration or downcycling into lower-grade materials.
                                             // LEED Points Eligibility: Identify how the material can contribute to LEED certification (e.g., points under MR—Materials and Resources, or EQ—Indoor Environmental Quality). Include applicable credits such as rapidly renewable materials, low-emitting materials, or regional sourcing. give in detail
                                             // Energy Usage (Embodied Energy): Discuss in detail the energy consumed in producing the material, including harvesting, processing, and transportation. Indicate whether the material has a relatively low embodied energy footprint and how that compares to alternatives.
                                             // Example:
                                             // Sustainable Material: Manufactured from fast-growing, small-diameter trees, reducing dependency on old-growth forests and promoting sustainable forest management.
                                             // Low Formaldehyde Emissions: Uses low-formaldehyde resins compliant with CARB Phase 2 and TSCA Title VI, minimizing harmful indoor air pollutants.
                                             // VOC Levels: Rated as low-VOC according to GREENGUARD Gold standards, making it suitable for indoor environments with strict air quality requirements.
                                             // Recyclability: Difficult to recycle due to resin content; however, it can be incinerated for energy recovery in waste-to-energy systems.
                                             // LEED Points Eligibility: Can contribute to credits under LEED v4 categories such as MRc1 (Building Life-Cycle Impact Reduction) and EQc2 (Low-Emitting Materials), depending on project-specific factors.
                                             // Energy Usage (Embodied Energy): Requires moderate energy input during production, but its use of small-diameter logs and minimal waste processing lowers its overall embodied energy compared to conventional plywood. 
  }
]
\`\`\`

### Output Requirements:

- Detect and list **every distinct material** visible in the image—even partially visible or in the background.
- Use clues like texture, packaging, jobsite environment, edge profile, and surrounding tools for accurate inference.
- Ensure **clarity and accuracy**—avoid generic terms or assumptions not grounded in visual evidence.
- Highlight real manufacturers, guides, and standards wherever applicable.
- Structure your response for **real-world use** on construction sites, takeoff platforms, or learning hubs.
- If specific links (spec sheets, videos, training) are unavailable, **omit or mark as premium access only**.
- Output must be clean, consistent, and parseable by downstream systems.

Analyze the following image and return the complete JSON output:
              `,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 2000,
    });
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    throw new Error("Failed to analyze image with OpenAI");
  }
};

const mainBuildingAnalysisPipeline = async (imageUrl) => {
  // serp api
  const buildingName = await generateBuildingNameFromImage(imageUrl);
  console.log("building name from serp api", buildingName);

  // openai api for cleaning building name of serp api
  let cleanBuildingTittle;
  if (buildingName) {
    cleanBuildingTittle = await tittleCleaningofBuilding(buildingName);
  }

  const buildingInsights = await generateBuildingAnalysisFromImage(imageUrl);

  return { cleanBuildingTittle, buildingInsights };
};

// serp api to find building name
const generateBuildingNameFromImage = async (imageUrl) => {
  const serpApiKey = process.env.SERP_API_KEY || "";
  if (!serpApiKey) {
    return null;
  }
  const googleLensEndpoint = `https://serpapi.com/search.json?engine=google_lens&url=${encodeURIComponent(
    imageUrl
  )}&api_key=${serpApiKey}`;

  try {
    const res = await fetch(googleLensEndpoint);
    const data = await res.json();

    // Extract building name if present in the first result
    return data?.visual_matches?.[0]?.title || null;
  } catch (err) {
    console.error("Google Lens SERP API error:", err);
    return null;
  }
};

// cleaning title of building from open ai
const tittleCleaningofBuilding = async (buildingName) => {
  console.log("Original input:", buildingName);
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You will be given a noisy string that includes a building name or title, mixed with extra text from search results or page titles.

Your task is to extract only the clean, relevant title or name (e.g., the actual name of a building, song, or content) and remove all other info such as streaming services, authors, promotional content, or metadata.

Example Input: "Stream Taj Mahal - Jorge Ben Jor by Braniff | Listen online for free on SoundCloud"
Output: "Taj Mahal"

Now extract only the clean title from the following:
"${buildingName}"
              `.trim(),
            },
          ],
        },
      ],
      max_tokens: 2000,
    });

    const rawOutput = response.choices?.[0]?.message?.content?.trim();
    const cleanQuotes = (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return text.replace(/^["']|["']$/g, "");
      }
    };
    const cleanedTitle = cleanQuotes(rawOutput);

    console.log("Cleaned building name:", cleanedTitle);
    return cleanedTitle;
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    throw new Error("Failed to clean title with OpenAI");
  }
};

// open ai to find insights of building through image
const generateBuildingAnalysisFromImage = async (imageUrl) => {
  console.log({ imageUrl });
  try {
    return await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You are a world-class architectural analyst and expert in historical buildings, construction methods, and urban planning. Your task is to analyze any image of a building or structure and return a **comprehensive, structured JSON array** describing **each identifiable building or major architectural element** in the image.

For every visible building (even those partially in frame or in the background), return a structured object with the following fields:

\`\`\`json
[
  {
    "buildingType": "string",                          // Specify the building type in 2 to 3 words
    "description": "string",                           //  Briefly describe the building’s appearance, function, layout, and key design elements. Highlight unique features, usage, and architectural style in under 30 words.
    "keyFeatures": "string",                 
                                                      // Outline the standout characteristics and advantages of this building type. Focus on practical functionality, lifestyle enhancements, and integrated design features.
                                                      // Use the exact step-by-step format below, always starting each item with a number (1, 2, 3...) followed by a bolded title and a colon. Then, provide a concise explanation.
                                                      // Example:
                                                      // 1. High-Density Living: Urban apartments efficiently utilize limited city space, accommodating more residents per square foot compared to suburban housing.
                                                      // 2. Mixed-Use Development: Many urban apartments are part of mixed-use complexes, integrating residential units with retail, office spaces, and recreational facilities.
                                                      // 3. Amenities: Common amenities include fitness centers, communal lounges, rooftop gardens, and co-working spaces.
                                                      // 4. Security: Features such as controlled access, surveillance systems, and on-site security personnel are standard.

    "yearBuilt": "string",
                                                      // Return the estimated construction completion date in this exact format: "Built [day][ordinal] of [Month] [Year]" (e.g., "Built 23rd of December 1900").
                                                      // Do not use vague terms like "circa", "around", or decade ranges (e.g., "1990s").
                                                      // If the exact date is uncertain, still provide the closest specific full date possible, and clarify in the explanation how the estimate was made.
                                                      // After the formatted date, include a sentence explaining how the date was determined (e.g., based on architectural style, building materials, historical data, or visible construction methods).
                                                      // Always start the response with the full formatted date.


    "historicalSignificance": "string",                
                                                       // Describe the historical evolution and societal impact of this building type. Include key milestones or transformations across eras (e.g., ancient origins, industrial use, modern adaptations). Example: 
                                                       // "Ancient Origins: The concept of multi-family dwellings dates back to ancient civilizations, with Roman insulae serving as early examples of apartment living. 
                                                       // Urbanization Driver: Apartments have been pivotal in accommodating growing urban populations, shaping the skyline and culture of cities worldwide. 
                                                       // Modern Transformations: Recent trends include converting obsolete office buildings into residential units, exemplified by projects like SoMA at 25 Water Street in New York City."
                                                       // return in step by step (1, 2, 3)

    "architectDesigner": "string",                     
                                                       // Highlight notable architects or architectural firms associated with this building type. Provide a brief profile of each, focusing on their design philosophy, signature styles, or innovations within this building category. Example: 
                                                       // "Daabforms Architects: Specializes in urban design and master planning, creating cohesive and aesthetically pleasing apartment complexes.
                                                       // Portman Architects: Known for integrating high-end apartments within urban mixed-use developments, focusing on sustainability and community engagement."
                                                      // return in step by step (1, 2, 3)

    "buildingMaterialsUsed": "string",
// Provide a detailed, step-by-step list of building materials commonly used for this building type.
// Format each item as:
// Step Number. Material Name: Description
// - Clearly explain the material's primary function and any notable aesthetic or performance characteristics.
// - Do NOT group materials by category (e.g., structural, interior, exterior); instead, list all relevant materials in a single sequence.
// - Use precise, professional language suitable for construction documentation or technical reports.
//
// Example:
// 1. Reinforced Concrete: A structural material combining steel reinforcement with concrete to deliver high strength, durability, and load-bearing capacity.
// 2. Drywall: A gypsum-based panel widely used for interior walls and ceilings, offering smooth finishes and ease of installation.
// 3. Brick: A fired clay unit valued for its longevity, thermal insulation, and classic aesthetic appeal, especially in exterior facades.
//
// Ensure each material listed adds practical value or is commonly recognized in the building industry.

    "relatedBuildingCodes": "string",                 
                                                       // Identify relevant local or national building codes applicable to this building type. Mention specific laws or regulations by name (e.g., Lagos State Urban and Regional Planning and Development Law, 2019) and summarize what aspects they govern (e.g., structural safety, fire prevention, accessibility, energy efficiency). Also include reference to international standards where applicable. 
                                                       // Example:
                                                       // "Lagos State: Urban residential apartments must comply with the Lagos State Urban and Regional Planning and Development Law (2019) and the National Building Codes, ensuring safety and structural integrity.
                                                       // International Standards: In other regions, building codes vary but generally cover aspects like fire safety, accessibility, structural requirements, and energy efficiency."
                                                       // return in step by step (1, 2, 3)

    "similarFamousBuildings": "string",                 
                                                       // Provide a list of notable real-world buildings that are similar in type, purpose, or architectural style. For each, include the name, location, and a brief description (1–2 sentences) explaining its significance in terms of design, innovation, or cultural impact.
                                                       // Example:
                                                       // "Linked Hybrid, Beijing: A mixed-use complex featuring interconnected towers with sky bridges, promoting community interaction.
                                                       // Habitat 67, Montreal: An iconic housing complex known for its unique modular design, reimagining urban living spaces.
                                                       // SoMA at 25 Water Street, NYC: The largest office-to-residential conversion in the U.S., transforming a former office tower into upscale apartments."
                                                       // return in step by step (1, 2, 3)
  }
]

\`\`\`

**Instructions:**

- Identify every building or major structural element present in the image with high precision.
- Do not omit buildings that are partially visible or background structures with identifiable features.
- If unsure, infer the most likely type or style based on proportions, materials, façade, and contextual elements like urban density.
- For each building, give a clear breakdown that would be valuable for architecture students, apprentices, city planners, and engineering professionals.
- Support all information with references to industry standards, such as the International Building Code (IBC), Wikidata, or LEED guidelines when applicable.
- Base historical context on reliable public sources—cross-reference architectural styles with time periods and movements.
- Include construction methods relevant to real-world applications and safety considerations.
- Explain technical terms for educational clarity, and link to additional learning resources for deeper study.


Now, carefully analyze the image below and return the full JSON array of building found:
              `,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 2000,
    });
  } catch (err) {
    console.error("Error calling OpenAI:", err);
    throw new Error("Failed to analyze image with OpenAI");
  }
};

// Main controller
const scanImage = async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }

    let imageType, base64Data, extension, fileName, filePath, imageUrl;
    try {
      // Extract the image format (e.g. image/png)
      const matches = image.match(/^data:(.+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ message: "Invalid base64 image format" });
      }

      imageType = matches[1]; // like image/png
      base64Data = matches[2];
      extension = imageType.split("/")[1]; // like png
      fileName = `tool-scan-${Date.now()}.${extension}`;
      filePath = path.join(__dirname, "../uploads", fileName);

      fs.writeFileSync(filePath, base64Data, "base64");
      console.log("Saved image to:", filePath);

      imageUrl = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
      console.log("Image URL:", imageUrl);
    } catch (fileErr) {
      console.error("Error saving image:", fileErr);
      return res.status(500).json({ error: "Failed to save image" });
    }

    let response;
    let buildingTitle;
    let classification;
    try {
      classification = await classifyImageType(image);
      console.log("Image classified as:", classification);

      if (classification === "building") {
        const result = await mainBuildingAnalysisPipeline(imageUrl);
        response = result.buildingInsights;
        buildingTitle = result.cleanBuildingTittle;
      } else if (classification === "tool") {
        response = await generateToolAnalysisFromImage(image);
      } else if (classification === "material") {
        response = await generateMaterialAnalysisFromImage(image);
      } else if (classification === "both") {
        try {
          // Get responses from all three API calls in parallel
          const [toolRaw, buildingRaw, materialRaw] = await Promise.all([
            generateToolAnalysisFromImage(image),
            generateBuildingAnalysisFromImage(image),
            generateMaterialAnalysisFromImage(image),
          ]);

          // Parse each response
          const parseContent = (raw) => {
            try {
              return cleanJsonString(raw?.choices?.[0]?.message?.content || "");
            } catch (err) {
              console.error("Parsing failed:", err);
              return null;
            }
          };

          const toolResponse = parseContent(toolRaw);
          const buildingResponse = parseContent(buildingRaw);
          const materialResponse = parseContent(materialRaw);

          // Save tools data
          const savedTools = toolResponse
            ? await Promise.all(
                toolResponse.map(async (tool) => {
                  const { toolCard, detailedView, relatedTools = [] } = tool;

                  const newScan = new Scan({
                    mainHeader: "Construction Tools & Equipment🛠️",
                    subHeader: "Tools & Equipment",
                    imageUrl,
                    cardToolName: toolCard?.toolName || "",
                    thumbnail: toolCard?.thumbnail || "",
                    toolName: detailedView?.toolName || "",
                    category: detailedView?.category || "",
                    usage: detailedView?.usage || "",
                    specsLink: detailedView?.specsLink || "",
                    specsWebLink: detailedView?.specsWebLink || "",
                    specsPDFLink: detailedView?.specsPDFLink || "",
                    safetyGuidelines: detailedView?.safetyGuidelines || "",
                    description: detailedView?.description || "",
                    commonApplications: detailedView?.commonApplications || [],
                    whereToBuy: detailedView?.whereToBuy || [],
                    relatedContent: detailedView?.relatedContent || [],
                    instructionalVideoScript:
                      detailedView?.instructionalVideoScript || "",
                    relatedTools: relatedTools.map((related) => ({
                      toolName: related?.detailedView?.toolName || "",
                      category: related?.detailedView?.category || "",
                      usage: related?.detailedView?.usage || "",
                      specsLink: related?.detailedView?.specsLink || "",
                      specsWebLink: related?.detailedView?.specsWebLink || "",
                      specsPDFLink: related?.detailedView?.specsPDFLink || "",
                      safetyGuidelines:
                        related?.detailedView?.safetyGuidelines || "",
                      description: related?.detailedView?.description || "",
                      commonApplications:
                        related?.detailedView?.commonApplications || [],
                      whereToBuy: related?.detailedView?.whereToBuy || [],
                      relatedContent:
                        related?.detailedView?.relatedContent || [],
                      thumbnail: related?.toolCard?.thumbnail || "",
                    })),
                  });

                  return await newScan.save();
                })
              )
            : [];

          // Save buildings data
          const savedBuildings = buildingResponse
            ? await Promise.all(
                buildingResponse.map(async (building) => {
                  const newBuildingScan = new BuildingScan({
                    mainHeader: "Building Materials & Components🧱",
                    subHeader: "Building Materials & Components🧱",
                    imageUrl,
                    buildingType: building.buildingType || "",
                    architecturalStyle: building.architecturalStyle || "",
                    historicalFacts: building.historicalFacts || "",
                    constructionMethods: building.constructionMethods || "",
                    zoningCodeRelevance: building.zoningCodeRelevance || "",
                    learningHubLinks: building.learningHubLinks || [],
                  });

                  return await newBuildingScan.save();
                })
              )
            : [];

          // Save materials data
          const savedMaterials = materialResponse
            ? await Promise.all(
                materialResponse.map(async (material) => {
                  const newMaterialScan = new MaterialScan({
                    mainHeader: "Building Type🏠",
                    subHeader: "Building Type🏠",
                    imageUrl,
                    materialName: material.materialName || "",
                    materialCategory: material.materialCategory || "",
                    usageAndInstallation: material.usageAndInstallation || "",
                    manufacturerSpecsLinks:
                      material.manufacturerSpecsLinks || [],
                    safetyGuidelines: material.safetyGuidelines || "",
                    typicalUseCases: material.typicalUseCases || "",
                    installedBy: material.installedBy || "",
                    industryDefinitions: Object.entries(
                      material.industryDefinitions || {}
                    ).map(([term, definition]) => ({
                      term,
                      definition,
                    })),
                    sustainabilityInfo: material.sustainabilityInfo || "",
                    learningHubLinks: material.learningHubLinks || [],
                  });

                  return await newMaterialScan.save();
                })
              )
            : [];

          // Return combined response
          return res.status(200).json({
            classification: "both",
            tool: savedTools,
            building: savedBuildings,
            material: savedMaterials,
            imageUrl,
          });
        } catch (err) {
          console.error("Error processing 'both' classification:", err);
          return res
            .status(500)
            .json({ error: "Failed to process combined scan results" });
        }
      }
      console.log("OpenAI response:", response);
    } catch (openaiErr) {
      return res.status(500).json({ error: "AI analysis failed" });
    }

    let resultMaterial;
    try {
      if (classification === "material") {
        resultMaterial = cleanJsonString(response.choices[0].message.content);
        console.log(
          "🧾 Parsed Tool JSON:\n",
          JSON.stringify(resultMaterial, null, 2)
        ); // ✅
        if (!Array.isArray(resultMaterial)) throw new Error("Invalid format");
      }
    } catch (jsonErr) {
      console.error("Failed to parse OpenAI result:", jsonErr);
      return res.status(500).json({ error: "Invalid AI response format" });
    }

    if (classification === "material") {
      try {
        const savedMaterials = await Promise.all(
          resultMaterial.map(async (material) => {
            // fetching material name from open ai
            const materialName = material?.materialName || "Unnamed Material";

            const manufacturersQuery = `${materialName} manufacturers site:.com`;
            const youtubeVideoQuery = `${materialName} installation step by step site:youtube.com`;
            const specsQuery = `${materialName} ASTM specifications fire ratings R-values chemical resistance site:.org OR site:.gov OR site:.edu OR site:.com`;
            const relatedCoursesQuery = `${materialName} training material behavior installation performance site:.edu OR site:.org OR site:.com`;

            const [
              howToResults,
              specSheetResults,
              certificationCoursesResults,
              purchaseRentalOptionResults,
            ] = await Promise.all([
              searchSerpAPI(manufacturersQuery),
              searchSerpAPI(youtubeVideoQuery),
              searchSerpAPI(specsQuery),
              searchSerpAPI(relatedCoursesQuery),
            ]);

            // Extract URLs from SerpAPI's organic results
            const manufacturersName = (howToResults?.organic_results || [])
              .map((item) => item.link)
              .filter((url) => url);

            const videosGuide = (specSheetResults?.organic_results || [])
              .map((item) => item.link)
              .filter((url) => url);

            const specsName = (
              certificationCoursesResults?.organic_results || []
            )
              .map((item) => item.link)
              .filter((url) => url);

            const relatedCourses = (
              purchaseRentalOptionResults?.organic_results || []
            )
              .map((item) => item.link)
              .filter((url) => url);

            const newMaterialScan = new MaterialScan({
              imageUrl,
              materialName: material.materialName || "",
              materialCategory: material.materialCategory || "",
              materialDescription: material.materialDescription || "",
              applications: material.applications || "",
              handlingNotes: material.handlingNotes || "",
              environmentalImpact: material.environmentalImpact || "",

              manufacturersName: manufacturersName || "",
              videosGuide: videosGuide || "",
              specsName: specsName || "",
              relatedCourses: relatedCourses || "",
            });

            return await newMaterialScan.save();
          })
        );

        return res.status(200).json({ savedMaterials, imageUrl });
      } catch (dbErr) {
        console.error("Error saving materials to database:", dbErr);
        return res
          .status(500)
          .json({ error: "Failed to save material scan results" });
      }
    }

    // serp api function
    async function searchSerpAPI(query) {
      const apiKey = process.env.SERP_API_KEY; // Ensure your key is stored securely (e.g., in .env)
      const apiUrl = "https://serpapi.com/search";

      try {
        const response = await axios.get(apiUrl, {
          params: {
            q: query,
            api_key: apiKey,
            engine: "google", // Optional: specify engine (Google is default)
          },
          headers: {
            "Content-Type": "application/json",
          },
        });

        return response.data;
      } catch (error) {
        console.error(
          "SerpAPI search error:",
          error.response?.data || error.message
        );
        return null;
      }
    }

    //  building save
    let resultbuilding;
    try {
      if (classification === "building") {
        console.log("OpenAI raw response:", response);

        resultbuilding = cleanJsonString(response.choices[0].message.content);
        console.log(
          "🧾 Parsed Tool JSON:\n",
          JSON.stringify(resultbuilding, null, 2)
        ); // ✅
        if (!Array.isArray(resultbuilding)) throw new Error("Invalid format");
      }
    } catch (jsonErr) {
      console.error("Failed to parse OpenAI result:", jsonErr);
      return res.status(500).json({ error: "Invalid AI response format" });
    }

    if (classification === "building") {
      try {
        let savedBuilding = [];
        savedBuilding = await Promise.all(
          resultbuilding.map(async (building) => {
            // getting building type from open ai response to sent building type to apify
            const buildingType = building?.buildingType || "Unnamed Building";

            // Define the query
            const specializedCoursesQuery = `Professional courses in ${buildingType} design, construction`;

            // Use the updated SerpAPI search function
            const [specializedCoursesResult] = await Promise.all([
              searchSerpAPI(specializedCoursesQuery),
            ]);

            const specializedCourseUrls = (
              specializedCoursesResult?.organic_results || []
            )
              .map((item) => item.link)
              .filter((url) => url); // Remove any undefined/null URLs

            const newBuildingScan = new BuildingScan({
              mainHeader: "Building Materials & Components🧱",
              subHeader: "Building Materials & Components🧱",
              imageUrl,
              cleanedTitle: buildingTitle || "",
              buildingType: building.buildingType || "",
              description: building.description || "",
              keyFeatures: building.keyFeatures || "",
              yearBuilt: building.yearBuilt || "",
              historicalSignificance: building.historicalSignificance || "",
              architectDesigner: building.architectDesigner || "",
              buildingMaterialsUsed: building.buildingMaterialsUsed || "",
              relatedBuildingCodes: building.relatedBuildingCodes || "",
              similarFamousBuildings: building.similarFamousBuildings || "",
              specializedCourseUrls: specializedCourseUrls,
            });

            return newBuildingScan.save();
          })
        );
        return res.status(200).json({ savedBuilding, imageUrl });
      } catch (dbErr) {
        console.error("Error saving buildings to database:", dbErr);
        return res
          .status(500)
          .json({ error: "Failed to save building scan results" });
      }
    }

    if (classification === "none") {
      throw new Error(
        "The uploaded image does not contain identifiable construction content. Please upload an image showing construction tools, materials, or buildings."
      );
    }

    //  tool save
    let result;
    try {
      if (classification === "tool") {
        result = cleanJsonString(response.choices[0].message.content);
        console.log("🧾 Parsed Tool JSON:\n", JSON.stringify(result, null, 2));

        if (!Array.isArray(result)) throw new Error("Invalid format");

        // fetching tool name to give to apify
        //const toolNames = result.map(
        //(tool) => tool?.detailedView?.toolName || "Unnamed Tool"
        //);

        // Now fetch How-to Tutorials and Spec Sheets for each tool
        //const enrichedTools = await Promise.all(
        // toolNames.map(async (name, idx) => {
        // console.log(`🔧 Tool ${idx + 1}: ${name}`);

        //   const youtubeVideoQuery = `${name} Youtube Video Tutorial`;
        //  const specSheetQuery = `${name} specification sheet filetype:pdf`;
        //  const certificationCoursesQuery = `${name} Courses to get certified in tool usage with detailed description`;
        //const purchaseRentalOptionQuery = `${name} (Amazon / Home Depot / Manufacturer links)`;

        // const [
        //  howToResults,
        // specSheetResults,
        // certificationCoursesResults,
        // purchaseRentalOptionResults,
        // ] = await Promise.all([
        //  searchGoogleApify(youtubeVideoQuery),
        // searchGoogleApify(specSheetQuery),
        // searchGoogleApify(certificationCoursesQuery),
        //searchGoogleApify(purchaseRentalOptionQuery),
        //]);

        // console.dir(
        //{
        // toolName: name,
        // tutorials: (howToResults[0]?.organicResults || []).map(
        // (item) => ({
        // title: item.title,
        // url: item.url,
        //})
        //),
        //specificationSheets: (
        // specSheetResults[0]?.organicResults || []
        //).map((item) => ({
        // title: item.title,
        // url: item.url,
        //})),
        //certificationCourses: (
        //  certificationCoursesResults[0]?.organicResults || []
        //).map((item) => ({
        // title: item.title,
        //url: item.url,
        // })),
        //purchaseRental: (
        // purchaseRentalOptionResults[0]?.organicResults || []
        //).map((item) => ({
        // title: item.title,
        // url: item.url,
        // })),
        //},
        //  { depth: null, colors: true }
        //);
        //})
        //  );
      }
    } catch (err) {
      console.error("Failed to parse OpenAI result:", err);
      return res.status(500).json({ error: "Invalid AI response format" });
    }

    if (classification === "tool") {
      let savedTools = [];

      try {
        savedTools = await Promise.all(
          result.map(async (tool, idx) => {
            const { detailedView = {} } = tool;
            const toolName = detailedView?.toolName || "Unnamed Tool";

            // Get the tutorial URLs for this specific tool
            const youtubeVideoQuery = `${toolName} Youtube Video Tutorial`;
            const specSheetQuery = `${toolName} specification sheet filetype:pdf`;
            const certificationCoursesQuery = `${toolName} Courses to get certified in tool usage with detailed description`;
            const purchaseRentalOptionQuery = `${toolName} (Amazon / Home Depot / Manufacturer links)`;

            const [
              howToResults,
              specSheetResults,
              certificationCoursesResults,
              purchaseRentalOptionResults,
            ] = await Promise.all([
              searchSerpAPI(youtubeVideoQuery),
              searchSerpAPI(specSheetQuery),
              searchSerpAPI(certificationCoursesQuery),
              searchSerpAPI(purchaseRentalOptionQuery),
            ]);

            // Extract URLs from SerpAPI's organic results
            const tutorialUrls = (howToResults?.organic_results || [])
              .map((item) => item.link)
              .filter((url) => url);

            const specSheetUrls = (specSheetResults?.organic_results || [])
              .map((item) => item.link)
              .filter((url) => url);

            const certificationCoursesUrls = (
              certificationCoursesResults?.organic_results || []
            )
              .map((item) => item.link)
              .filter((url) => url);

            const purchaseRentalUrls = (
              purchaseRentalOptionResults?.organic_results || []
            )
              .map((item) => item.link)
              .filter((url) => url);
            const newScan = new Scan({
              mainHeader: "Construction Tools & Equipment🛠️",
              subHeader: "Tools & Equipment🛠️",
              imageUrl,
              toolName: toolName,
              category: detailedView?.category || "",
              description: detailedView?.description || "",
              primaryUses: detailedView?.primaryUses || "",
              skillLevel: detailedView?.skillLevel || "",
              manufacturers: detailedView?.manufacturers || "",
              safetyGuidelines: detailedView?.safetyGuidelines || "",
              tutorialUrls: tutorialUrls, // Just the URLs as an array of strings
              specSheetUrls: specSheetUrls, // Just the URLs as an array of strings
              certificationCoursesUrls: certificationCoursesUrls,
              purchaseRentalUrls: purchaseRentalUrls,
            });

            return await newScan.save();
          })
        );
      } catch (dbErr) {
        console.error("Error saving tools to database:", dbErr);
        return res.status(500).json({ error: "Failed to save scan results" });
      }

      return res.status(200).json({ savedTools, imageUrl });
    }
  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

module.exports = { scanImage };
