const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fs = require('fs');
const path = require('path');

const addonName = 'CryptoQuest_Test'; // TODO: fix it
const blenderOutputFolderPathAbsolute =
  process.env.NODE_ENV === 'development'
    ? process.env.BLENDER_OUTPUT_LOCAL_ADDRESS
    : process.env.BLENDER_OUTPUT_SERVER_ADDRESS;
const blenderOutputFolderPathRelative = '../../../blender_output/';

const {
  heroTierImagesIpfsUrls,
  heroTierRecipes,
} = require('../variables/nft.variables');
const pool = require('../config/db.config');

exports.throwErrorTokenAlreadyRevealed = (tokenAddress) => {
  throw new Error(
    `Token ${tokenAddress.slice(0, 8)}... has already been revealed`
  );
};

exports.throwErrorTokenHasNotBeenRevealed = async (tokenAddress) => {
  throw new Error(`Token ${tokenAddress.slice(0, 8)}... has not been revealed`);
};

exports.throwErrorTokenAlreadyCustomized = async (tokenAddress) => {
  throw new Error(`Token ${tokenAddress.slice(0, 8)}... already customized`);
};

exports.checkIsTokenAlreadyRevealed = async (tokenAddress) => {
  const isTokenAlreadyRevealedQuery = await pool.query(
    'SELECT EXISTS(SELECT 1 FROM tokens WHERE token_address = $1)',
    [tokenAddress]
  );

  const isTokenAlreadyRevealed = isTokenAlreadyRevealedQuery?.rows[0]?.exists;
  return isTokenAlreadyRevealed;
};

exports.checkIsTokenAlreadyCustomized = async (tokenId) => {
  const isTokenAlreadyCustomizedQuery = await pool.query(
    'SELECT EXISTS(SELECT * FROM characters WHERE nft_id = $1)',
    [tokenId]
  );

  const isTokenAlreadyCustomized = isTokenAlreadyCustomizedQuery.rows[0].exists;
  return isTokenAlreadyCustomized;
};

exports.getHeroTierImageFromIpfs = (heroTierRecipe) => {
  if (heroTierRecipe === heroTierRecipes.dawnOfManCommon) {
    return heroTierImagesIpfsUrls.dawnOfManCommon;
  } else if (heroTierRecipe === heroTierRecipes.dawnOfManUncommon) {
    return heroTierImagesIpfsUrls.dawnOfManUncommon;
  } else if (heroTierRecipe === heroTierRecipes.dawnOfManRare) {
    return heroTierImagesIpfsUrls.dawnOfManRare;
  } else if (heroTierRecipe === heroTierRecipes.dawnOfManEpic) {
    return heroTierImagesIpfsUrls.dawnOfManEpic;
  } else if (heroTierRecipe === heroTierRecipes.dawnOfManLegendary) {
    return heroTierImagesIpfsUrls.dawnOfManLegendary;
  } else if (heroTierRecipe === heroTierRecipes.dawnOfManMythic) {
    return heroTierImagesIpfsUrls.dawnOfManMythic;
  } else if (heroTierRecipe === heroTierRecipes.woodlandRespiteCommon) {
    return heroTierImagesIpfsUrls.woodlandRespiteCommon;
  } else if (heroTierRecipe === heroTierRecipes.woodlandRespiteUncommon) {
    return heroTierImagesIpfsUrls.woodlandRespiteUncommon;
  } else if (heroTierRecipe === heroTierRecipes.woodlandRespiteRare) {
    return heroTierImagesIpfsUrls.woodlandRespiteRare;
  } else if (heroTierRecipe === heroTierRecipes.woodlandRespiteEpic) {
    return heroTierImagesIpfsUrls.woodlandRespiteEpic;
  } else if (heroTierRecipe === heroTierRecipes.woodlandRespiteLegendary) {
    return heroTierImagesIpfsUrls.woodlandRespiteLegendary;
  } else if (heroTierRecipe === heroTierRecipes.woodlandRespiteMythic) {
    return heroTierImagesIpfsUrls.woodlandRespiteMythic;
  }
};

exports.selectTokenByAddress = async (tokenAddress) => {
  const tokenQuery = await pool.query(
    'SELECT * FROM tokens WHERE token_address = $1',
    [tokenAddress]
  );
  const token = tokenQuery?.rows?.[0];
  return token;
};

exports.renderTokenFromBlender = async (tokenId, cosmeticTraits, heroTier) => {
  console.log(tokenId);

  const {
    race,
    sex,
    faceStyle,
    eyeDetail,
    eyes,
    facialHair,
    glasses,
    hairStyle,
    hairColor,
    necklace,
    earring,
    nosePiercing,
    scar,
    tattoo,
    background,
  } = cosmeticTraits;

  const config = {
    engine: 'CYCLES',
    width: 128,
    height: 128,
    'NFT name': `${race}_${sex}_${faceStyle.split(' ').join('_')}`,
    'Token Id': tokenId,
    race,
    sex,
    face_style: faceStyle,
    hero_tier: heroTier,
    eye_detail: eyeDetail,
    eye_colors: eyes.split(' ').pop(),
    facial_hair: facialHair,
    glasses,
    hair_style: hairStyle,
    hair_color: hairColor,
    necklace,
    earring,
    nose_piercing: nosePiercing,
    scar,
    face_tattoo: tattoo,
    background,
  };

  console.log(config);

  const configJSON = JSON.stringify(config, null, 2);
  fs.writeFileSync(
    path.resolve(
      __dirname,
      `${blenderOutputFolderPathRelative}${tokenId}.json`
    ),
    configJSON
  );

  const { stdout, stderr } = await exec(
    `blender 1> nul -b --addons ${addonName} --python-expr "import bpy;bpy.ops.crypto_quest_test.render_from_json(jsonPath= '${blenderOutputFolderPathAbsolute}${tokenId}.json', outDir = '${blenderOutputFolderPathAbsolute}')"`
  );

  console.log('BLENDER STDOUT:', stdout);
  if (stderr) {
    console.log('BLENDER STDERR:', stderr);
    const renderedImageExist = stderr.includes('exists in Tokens Directory');
    if (!renderedImageExist) {
      throw new Error(
        'Render error. Impossible to render character with selected traits'
      );
    }
  }

  return 'success';
};
